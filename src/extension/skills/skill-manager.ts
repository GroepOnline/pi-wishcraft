/**
 * skill-manager.ts
 * ---------------------------------------------------------------------------
 * Skill workbench overlay:
 *   - split pane: list + metadata + health + sparkline + preview
 *   - type-to-filter, tab category, ctrl+s sort
 *   - n / ctrl+n inline or command wizard, enter inserts
 *   - → detail body, ctrl+e edit, ctrl+d delete
 * ---------------------------------------------------------------------------
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import { realpathSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "../../paths/agent-dirs.ts";
import { openWishcraftDeck } from "../ui/deck/index.ts";
import type { RuntimeState } from "../core/types.ts";
import {
  applySkillFilter,
  getSkillUsage,
  invalidateSkillCache,
  loadSkillCatalog,
  insertSkillBody,
  readSkillBody,
  type SkillCategory,
  type SkillEntry,
} from "./skill-registry.ts";
import {
  collectSkillDoctorInputs,
  diagnoseSkills,
  runSkillDoctor,
  type SkillDoctorRow,
} from "./skill-doctor.ts";
import { runSkillsNew, sanitizeSkillName, writeSkillFromTemplate } from "./skill-templates.ts";
import {
  applyWizardInput,
  composeWizardSkill,
  createSkillWizard,
  cycleWizardTemplate,
  renderSkillWorkbench,
  retreatWizard,
  wizardIsComplete,
  type SkillWizardState,
} from "./workbench.ts";
import { workbenchSkillFromEntry } from "./workbench-catalog.ts";

const CATEGORY_LABELS: Record<SkillCategory | "all", string> = {
  all: "all",
  global: "global",
  project: "project",
  prompts: "prompts",
  extra: "extra",
};

const CATEGORY_ORDER: (SkillCategory | "all")[] = [
  "all",
  "global",
  "project",
  "prompts",
  "extra",
];

const DETAIL_ROWS = 18;

function isPrintable(data: string): boolean {
  return data.length === 1 && data >= " " && data <= "~";
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatLastUsed(ms: number): string {
  if (!ms) return "never";
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/** Append text as a new editor line; the user presses enter to run it. */
function appendToEditor(ctx: any, text: string, notify: string): void {
  const current = ctx.ui.getEditorText?.() ?? "";
  const separator = current && !current.endsWith("\n") ? "\n" : "";
  ctx.ui.setEditorText(`${current}${separator}${text}\n`);
  ctx.ui.notify(notify, "info");
}

/** POSIX single-quote a path so a skill name with shell metacharacters
 * (e.g. `a; curl … | sh` from an untrusted cloned repo) cannot inject. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

/**
 * Resolve `target` through symlinks and confirm it stays within one of the
 * canonical skill roots (agent skills dir, `<cwd>/.pi/skills`, `<cwd>/skills`).
 * Guards the recursive delete against catalog paths that a cloned/untrusted
 * repo could point outside the expected trees. Returns false when the path
 * cannot be resolved (e.g. already removed) so callers fail closed.
 */
export function isContainedInSkillRoots(target: string, cwd: string): boolean {
  const roots = [
    join(getAgentDir(), "skills"),
    join(cwd, ".pi", "skills"),
    join(cwd, "skills"),
  ];
  let real: string;
  try {
    real = realpathSync(target);
  } catch {
    return false;
  }
  return roots.some((root) => {
    let realRoot: string;
    try {
      realRoot = realpathSync(root);
    } catch {
      return false;
    }
    const rel = relative(realRoot, real);
    return rel !== "" && !rel.startsWith("..") && !rel.startsWith("/");
  });
}

/**
 * Only allow a bare, path-like editor invocation (no arguments, no shell
 * metacharacters) so a hostile `EDITOR` value cannot inject into the `!` flow.
 * Falls back to `nvim` when the value is unusable.
 */
export function safeEditor(): string {
  const ed = process.env.EDITOR?.trim();
  return ed && /^[\w./-]+$/.test(ed) ? ed : "nvim";
}

function editorCommand(path: string): string {
  return `!${safeEditor()} ${shellQuote(path)}`;
}

export async function showSkillManager(ctx: any): Promise<"new" | null> {
  invalidateSkillCache();
  let entries = loadSkillCatalog(ctx.cwd ?? process.cwd());
  const usage = getSkillUsage();
  if (entries.length === 0) {
    ctx.ui.notify("No skills found", "info");
  }

  return ctx.ui.custom(
    (
      tui: any,
      theme: Theme,
      _keybindings: any,
      done: (result: "new" | null) => void,
    ) => {
      const border = (text: string) => theme.fg("dim", text);
      const wrapRow = (text: string, innerWidth: number): string =>
        `${border("│")}${truncateToWidth(text, innerWidth, "…", true)}${border("│")}`;

      let mode: "list" | "detail" = "list";
      let query = "";
      let category: SkillCategory | "all" = "all";
      let sort: "name" | "usage" = "name";
      let selected = 0;
      let detail: SkillEntry | null = null;
      let bodyLines: string[] = [];
      let scroll = 0;
      let confirmDelete = false;
      let wizard: SkillWizardState | null = null;
      let doctorByName = new Map<string, SkillDoctorRow>();

      const refreshDoctor = () => {
        const inputs = collectSkillDoctorInputs(ctx.cwd ?? process.cwd());
        doctorByName = new Map(
          diagnoseSkills(inputs.entries, inputs.usage, inputs.contents).map((row) => [
            row.skill,
            row,
          ]),
        );
      };
      refreshDoctor();

      const filtered = (): SkillEntry[] =>
        applySkillFilter(entries, query, category, sort, usage);

      const selectedEntry = (): SkillEntry | null => {
        const f = filtered();
        return f[selected] ?? f[0] ?? null;
      };

      const openDetail = (entry: SkillEntry) => {
        detail = entry;
        bodyLines = readSkillBody(entry.filePath).split("\n");
        scroll = 0;
        confirmDelete = false;
        mode = "detail";
      };

      const close = () => done(null);

      const doDelete = (entry: SkillEntry) => {
        const cwd = ctx.cwd ?? process.cwd();
        try {
          if (entry.isDirectorySkill && entry.filePath.endsWith("SKILL.md") &&
              (entry.category === "global" || entry.category === "project")) {
            if (!isContainedInSkillRoots(entry.baseDir, cwd)) {
              throw new Error(`refusing to delete outside skill roots: ${entry.baseDir}`);
            }
            rmSync(entry.baseDir, { recursive: true, force: true });
          } else {
            if (!isContainedInSkillRoots(entry.filePath, cwd)) {
              throw new Error(`refusing to delete outside skill roots: ${entry.filePath}`);
            }
            rmSync(entry.filePath, { force: true });
          }
          ctx.ui.notify(`Skill deleted: ${entry.name}`, "info");
        } catch (error) {
          ctx.ui.notify(
            `Delete failed: ${error instanceof Error ? error.message : String(error)}`,
            "error",
          );
        }
        invalidateSkillCache();
        entries = loadSkillCatalog(ctx.cwd ?? process.cwd());
        refreshDoctor();
        mode = "list";
        confirmDelete = false;
        selected = Math.min(selected, Math.max(0, filtered().length - 1));
      };

      const insertBody = (entry: SkillEntry) => {
        insertSkillBody(ctx, entry.name, readSkillBody(entry.filePath));
        ctx.ui.notify("Skill inserted into your prompt", "info");
      };

      return {
        render: (width: number) => {
          const innerWidth = Math.max(1, width - 2);
          const lines: string[] = [];
          lines.push(border(`╭${"─".repeat(innerWidth)}╮`));

          if (wizard) {
            const workbench = renderSkillWorkbench(theme, innerWidth, [], 0, wizard);
            for (const line of workbench) lines.push(wrapRow(line, innerWidth));
          } else if (mode === "list") {
            const f = filtered();
            const head = `Skills · ${f.length}/${entries.length} · ${sort === "name" ? "name" : "usage"} · ${CATEGORY_LABELS[category]}${query ? ` · search "${query}"` : ""}`;
            lines.push(wrapRow(theme.fg("accent", theme.bold(head)), innerWidth));
            lines.push(border(`├${"─".repeat(innerWidth)}┤`));

            const skills = f.map((entry) =>
              workbenchSkillFromEntry(entry, usage, doctorByName),
            );
            if (f.length === 0 && query) {
              lines.push(
                wrapRow(theme.fg("warning", `No skills for "${query}"`), innerWidth),
              );
            } else {
              const workbench = renderSkillWorkbench(
                theme,
                innerWidth,
                skills,
                selected,
                null,
              );
              for (const line of workbench) lines.push(wrapRow(line, innerWidth));
            }

            lines.push(border(`├${"─".repeat(innerWidth)}┤`));
            if (confirmDelete) {
              lines.push(
                wrapRow(
                  theme.fg(
                    "warning",
                    `ctrl+d or enter = delete "${selectedEntry()?.name ?? ""}", any other key cancels`,
                  ),
                  innerWidth,
                ),
              );
            } else {
              lines.push(
                wrapRow(
                  theme.fg(
                    "dim",
                    "type=filter · tab=category · ctrl+s=sort · →=detail",
                  ),
                  innerWidth,
                ),
              );
              lines.push(
                wrapRow(
                  theme.fg(
                    "dim",
                    "n/ctrl+n=new · enter=insert · ctrl+e=edit · ctrl+d=delete · esc=close",
                  ),
                  innerWidth,
                ),
              );
            }
          } else if (detail) {
            const e = detail;
            lines.push(
              wrapRow(
                `${theme.fg("accent", theme.bold(`Skill · ${e.name}`))}  ${theme.fg("dim", CATEGORY_LABELS[e.category])}`,
                innerWidth,
              ),
            );
            if (e.description) {
              lines.push(wrapRow(theme.fg("muted", e.description), innerWidth));
            }
            lines.push(border(`├${"─".repeat(innerWidth)}┤`));
            const u = usage.get(e.name);
            const meta = (label: string, value: string) =>
              wrapRow(
                `${theme.fg("dim", `${label.padEnd(12)}`)}${theme.fg("text", value)}`,
                innerWidth,
              );
            lines.push(
              meta(
                "used",
                `${u?.count ?? 0}× · last ${formatLastUsed(u?.lastUsed ?? 0)}`,
              ),
            );
            lines.push(meta("file", e.filePath));
            lines.push(
              meta(
                "size",
                `${formatBytes(e.sizeBytes)} · ${e.lineCount} lines · changed ${formatLastUsed(e.mtimeMs)}`,
              ),
            );
            lines.push(
              meta(
                "frontmatter",
                e.frontmatterKeys.length
                  ? e.frontmatterKeys.join(", ")
                  : "(none)",
              ),
            );
            if (e.disableModelInvocation) {
              lines.push(
                wrapRow(
                  theme.fg("warning", "model invocation off — insert only"),
                  innerWidth,
                ),
              );
            }
            if (e.warning) {
              lines.push(wrapRow(theme.fg("warning", `⚠ ${e.warning}`), innerWidth));
            }
            lines.push(border(`├${"─".repeat(innerWidth)}┤`));
            const shown = bodyLines.slice(scroll, scroll + DETAIL_ROWS);
            if (shown.length === 0 || shown.join("").trim() === "") {
              lines.push(wrapRow(theme.fg("dim", "(empty body)"), innerWidth));
            }
            for (const line of shown) {
              lines.push(wrapRow(theme.fg("text", line || " "), innerWidth));
            }
            lines.push(border(`├${"─".repeat(innerWidth)}┤`));
            if (confirmDelete) {
              lines.push(
                wrapRow(
                  theme.fg("warning", `ctrl+d or enter = delete "${e.name}", any other key cancels`),
                  innerWidth,
                ),
              );
            } else {
              lines.push(
                wrapRow(
                  theme.fg(
                    "dim",
                    "↑↓ scroll · enter=insert · ctrl+e=edit · ctrl+d=delete · ←/esc=back",
                  ),
                  innerWidth,
                ),
              );
            }
          }

          lines.push(border(`╰${"─".repeat(innerWidth)}╯`));
          return lines;
        },

        invalidate: () => {},

        handleInput: (data: string) => {
          const escape = matchesKey(data, "escape");
          const up = matchesKey(data, "up");
          const down = matchesKey(data, "down");

          if (wizard) {
            const open = wizard;
            if (escape || data === "\x03") {
              wizard = null;
              tui.requestRender();
              return;
            }
            if ((matchesKey(data, "enter") || data === "enter") && wizardIsComplete(open)) {
              try {
                const name = sanitizeSkillName(open.name);
                writeSkillFromTemplate(
                  name,
                  open.template,
                  undefined,
                  composeWizardSkill(open),
                );
                ctx.ui.notify(`Created skill ${name}`, "info");
                wizard = null;
                invalidateSkillCache();
                entries = loadSkillCatalog(ctx.cwd ?? process.cwd());
                refreshDoctor();
              } catch (error) {
                wizard = {
                  ...open,
                  error: error instanceof Error ? error.message : String(error),
                };
              }
              tui.requestRender();
              return;
            }
            if (up) wizard = cycleWizardTemplate(open, -1);
            else if (down) wizard = cycleWizardTemplate(open, 1);
            else if (data === "left" || matchesKey(data, "left")) {
              wizard = retreatWizard(open);
            } else {
              wizard = applyWizardInput(open, data);
            }
            tui.requestRender();
            return;
          }

          if (mode === "list") {
            const f = filtered();
            if (confirmDelete) {
              // Confirm delete: ctrl+d or enter; any other key cancels.
              if (data === "\x04" || matchesKey(data, "enter")) {
                const entry = selectedEntry();
                if (entry) doDelete(entry);
              } else {
                confirmDelete = false;
              }
            } else if (escape || data === "\x03") {
              close();
              return;
            } else if (up) {
              selected = selected === 0 ? f.length - 1 : selected - 1;
            } else if (down) {
              selected = selected === f.length - 1 ? 0 : selected + 1;
            } else if (matchesKey(data, "tab")) {
              const idx = CATEGORY_ORDER.indexOf(category);
              category = CATEGORY_ORDER[(idx + 1) % CATEGORY_ORDER.length]!;
              selected = 0;
            } else if (data === "\x13") {
              // ctrl+s = sort
              sort = sort === "name" ? "usage" : "name";
              selected = 0;
            } else if (data === "\x05") {
              // ctrl+e = edit
              const entry = selectedEntry();
              if (entry) {
                appendToEditor(
                  ctx,
                  editorCommand(entry.filePath),
                  "Edit command in the editor — press enter to run it",
                );
                close();
                return;
              }
            } else if (data === "\x0e") {
              // ctrl+n keeps the command-line `/skills new` flow
              done("new");
              return;
            } else if (query === "" && (data === "n" || data === "N")) {
              wizard = createSkillWizard();
            } else if (data === "\x04") {
              // ctrl+d = delete (with confirm)
              if (selectedEntry()) confirmDelete = true;
            } else if (matchesKey(data, "enter")) {
              const entry = selectedEntry();
              if (entry) {
                insertBody(entry);
                close();
                return;
              }
            } else if (matchesKey(data, "right")) {
              const entry = selectedEntry();
              if (entry) openDetail(entry);
            } else if (
              isPrintable(data) ||
              matchesKey(data, "backspace") ||
              data === "\x15"
            ) {
              // typing filters; ctrl+u clears the filter
              if (data === "\x15") query = "";
              else if (matchesKey(data, "backspace")) query = query.slice(0, -1);
              else query += data;
              selected = 0;
            }
          } else {
            // detail mode
            if (confirmDelete) {
              if (data === "\x04" || matchesKey(data, "enter")) {
                if (detail) doDelete(detail);
              } else {
                confirmDelete = false;
              }
            } else if (escape || matchesKey(data, "left")) {
              mode = "list";
            } else if (up) {
              scroll = Math.max(0, scroll - 1);
            } else if (down) {
              scroll = Math.min(
                Math.max(0, bodyLines.length - DETAIL_ROWS),
                scroll + 1,
              );
            } else if (data === "\x05") {
              // ctrl+e = edit
              appendToEditor(
                ctx,
                editorCommand(detail!.filePath),
                "Edit command in the editor — press enter to run it",
              );
              close();
              return;
            } else if (data === "\x04") {
              // ctrl+d = delete
              confirmDelete = true;
            } else if (matchesKey(data, "enter") || matchesKey(data, "tab")) {
              insertBody(detail!);
              close();
              return;
            }
          }
          tui.requestRender();
        },
      };
    },
    {
      overlay: true,
      overlayOptions: () => ({
        verticalAlign: "center",
        horizontalAlign: "center",
      }),
    },
  );
}

/** Register the `/skills` command. */
export type SkillManagerCommandDeps = {
  runDoctor?: (ctx: any) => Promise<void>;
};

export function registerSkillManagerCommand(
  pi: ExtensionAPI,
  rt: RuntimeState,
  deps: SkillManagerCommandDeps = {},
): void {
  const runDoctor = deps.runDoctor ?? runSkillDoctor;
  pi.registerCommand("skills", {
    description: "Browse installed skills, or `doctor` / `new [template]`",
    handler: async (args: string, ctx: any) => {
      if (!rt.enabled || !ctx.hasUI) {
        ctx.ui.notify("Powerline UI is disabled", "info");
        return;
      }
      const sub = args?.trim().split(/\s+/)[0]?.toLowerCase();
      if (sub === "deck") {
        await openWishcraftDeck(rt, ctx, "skills");
        return;
      }
      if (sub === "doctor") {
        await runDoctor(ctx);
        return;
      }
      if (sub === "new") {
        await runSkillsNew(ctx, args);
        return;
      }
      const result = await showSkillManager(ctx);
      if (result === "new") await runSkillsNew(ctx, "");
    },
  });
}

// Re-export for existing importers/tests.
export { listSkills, readSkillBody } from "./skill-registry.ts";
