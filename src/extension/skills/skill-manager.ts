/**
 * skill-manager.ts
 * ---------------------------------------------------------------------------
 * Skills Manager v2 — list ⇄ detail overlay:
 *   - search that actually filters (type=filter, ctrl+u clears)
 *   - category headers (global/project/prompts/extra) + tab category filter
 *   - sort by name or usage (s), usage counts from the ledger
 *   - detail panel: metadata, frontmatter, body with scroll
 *   - e=edit (edit command in the editor via pi's ! flow),
 *     n=new skill, d=delete with confirm
 * ---------------------------------------------------------------------------
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { realpathSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "../../paths/agent-dirs.ts";
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
import { runSkillDoctor } from "./skill-doctor.ts";
import { runSkillsNew } from "./skill-templates.ts";

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

const LIST_ROWS = 14;
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
function isContainedInSkillRoots(target: string, cwd: string): boolean {
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
function safeEditor(): string {
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

          if (mode === "list") {
            const f = filtered();
            // Header: total + sort + live filter
            const head = `Skills · ${f.length}/${entries.length} · ${sort === "name" ? "name" : "usage"} · ${CATEGORY_LABELS[category]}${query ? ` · search "${query}"` : ""}`;
            lines.push(wrapRow(theme.fg("accent", theme.bold(head)), innerWidth));
            lines.push(border(`├${"─".repeat(innerWidth)}┤`));

            if (f.length === 0) {
              const emptyMsg =
                entries.length === 0 && !query
                  ? "No skills installed — ctrl+n to create one"
                  : `No skills for "${query}"`;
              lines.push(
                wrapRow(theme.fg("warning", emptyMsg), innerWidth),
              );
            } else {
              // scroll window around the selection
              const start = Math.max(
                0,
                Math.min(selected - Math.floor(LIST_ROWS / 2), f.length - LIST_ROWS),
              );
              const end = Math.min(start + LIST_ROWS, f.length);
              let prevCat: SkillCategory | null = null;
              for (let i = start; i < end; i++) {
                const e = f[i]!;
                if (e.category !== prevCat) {
                  prevCat = e.category;
                  const inCat = f.filter((x) => x.category === e.category).length;
                  lines.push(
                    wrapRow(
                      theme.fg(
                        "dim",
                        `── ${CATEGORY_LABELS[e.category]} · ${inCat} ──`,
                      ),
                      innerWidth,
                    ),
                  );
                }
                const isSel = i === selected;
                const u = usage.get(e.name);
                const usageTag = u && u.count > 0 ? `${u.count}× ` : "";
                const name = isSel
                  ? theme.fg("accent", `→ ${e.name}`)
                  : theme.fg("text", `  ${e.name}`);
                const warn = e.warning ? theme.fg("warning", " ⚠") : "";
                const desc = e.description
                  ? theme.fg("muted", `  ${truncateToWidth(e.description, Math.max(8, innerWidth - visibleWidth(e.name) - 10), "…", true)}`)
                  : "";
                const badge = theme.fg("dim", usageTag);
                lines.push(
                  wrapRow(`${name}${warn}  ${badge}${desc}`, innerWidth),
                );
              }
              if (start > 0 || end < f.length) {
                lines.push(
                  wrapRow(
                    theme.fg("dim", `(${selected + 1}/${f.length})`),
                    innerWidth,
                  ),
                );
              }
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
                    "type=filter · ↑↓ · →/enter=detail · tab=category · ctrl+s=sort",
                  ),
                  innerWidth,
                ),
              );
              lines.push(
                wrapRow(
                  theme.fg(
                    "dim",
                    "ctrl+e=edit · ctrl+n=new · ctrl+d=delete · esc=close",
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
              // ctrl+n = new skill from a template
              done("new");
              return;
            } else if (data === "\x04") {
              // ctrl+d = delete (with confirm)
              if (selectedEntry()) confirmDelete = true;
            } else if (matchesKey(data, "enter") || matchesKey(data, "right")) {
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
