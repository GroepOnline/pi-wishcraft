/**
 * skill-manager.ts
 * ---------------------------------------------------------------------------
 * Skills Manager v2 — volledig eigen TUI-overlay (lijst ⇄ detail) met:
 *   - zoeken dat echt filtert (type=filter, ctrl+u wist)
 *   - categorie-koppen (global/project/prompts/extra) + tab-categoriefilter
 *   - sorteren op naam of gebruik (s), usage-counts uit de ledger
 *   - detail-paneel: metadata, frontmatter, body met scroll
 *   - e=bewerken (edit-commando in de editor via pi's !-flow),
 *     n=nieuwe skill, d=verwijderen met confirm
 * ---------------------------------------------------------------------------
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { rmSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { RuntimeState } from "../core/types.ts";
import { getAgentPath } from "../../paths/agent-dirs.ts";
import {
  applySkillFilter,
  getSkillUsage,
  invalidateSkillCache,
  loadSkillCatalog,
  readSkillBody,
  recordSkillUsage,
  type SkillCategory,
  type SkillEntry,
} from "./skill-registry.ts";

const CATEGORY_LABELS: Record<SkillCategory | "all", string> = {
  all: "alles",
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
  if (!ms) return "nooit";
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "zojuist";
  if (min < 60) return `${min}m geleden`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}u geleden`;
  const d = Math.floor(h / 24);
  return `${d}d geleden`;
}

/** Voeg tekst toe aan de editor als nieuwe regel; de gebruiker drukt enter. */
function appendToEditor(ctx: any, text: string, notify: string): void {
  const current = ctx.ui.getEditorText?.() ?? "";
  const separator = current && !current.endsWith("\n") ? "\n" : "";
  ctx.ui.setEditorText(`${current}${separator}${text}\n`);
  ctx.ui.notify(notify, "info");
}

function editorCommand(path: string): string {
  const ed = process.env.EDITOR?.trim() || "nvim";
  return `!${ed} ${path}`;
}

export async function showSkillManager(ctx: any): Promise<void> {
  invalidateSkillCache();
  let entries = loadSkillCatalog(ctx.cwd ?? process.cwd());
  const usage = getSkillUsage();
  if (entries.length === 0) {
    ctx.ui.notify("No skills found", "info");
    return;
  }

  await ctx.ui.custom(
    (
      tui: any,
      theme: Theme,
      _keybindings: any,
      done: (result: null) => void,
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
        try {
          if (entry.isDirectorySkill && entry.filePath.endsWith("SKILL.md") &&
              (entry.category === "global" || entry.category === "project")) {
            rmSync(entry.baseDir, { recursive: true, force: true });
          } else {
            rmSync(entry.filePath, { force: true });
          }
          ctx.ui.notify(`Skill verwijderd: ${entry.name}`, "info");
        } catch (error) {
          ctx.ui.notify(
            `Verwijderen mislukt: ${error instanceof Error ? error.message : String(error)}`,
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
        const body = readSkillBody(entry.filePath);
        const current = ctx.ui.getEditorText?.() ?? "";
        const separator = current && !current.endsWith("\n") ? "\n\n" : "";
        ctx.ui.setEditorText(`${current}${separator}${body}\n`);
        recordSkillUsage(entry.name);
        ctx.ui.notify("Skill ingevoegd in je prompt", "info");
      };

      return {
        render: (width: number) => {
          const innerWidth = Math.max(1, width - 2);
          const lines: string[] = [];
          lines.push(border(`╭${"─".repeat(innerWidth)}╮`));

          if (mode === "list") {
            const f = filtered();
            // Kop: totaal + sort + live filter
            const head = `Skills · ${f.length}/${entries.length} · ${sort === "name" ? "naam" : "gebruik"} · ${CATEGORY_LABELS[category]}${query ? ` · zoek "${query}"` : ""}`;
            lines.push(wrapRow(theme.fg("accent", theme.bold(head)), innerWidth));
            lines.push(border(`├${"─".repeat(innerWidth)}┤`));

            if (f.length === 0) {
              lines.push(
                wrapRow(
                  theme.fg("warning", `Geen skills voor "${query}"`),
                  innerWidth,
                ),
              );
            } else {
              // scroll-window rondom de selectie
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
                    `d opnieuw = verwijderen "${selectedEntry()?.name ?? ""}", andere toets = annuleren`,
                  ),
                  innerWidth,
                ),
              );
            } else {
              lines.push(
                wrapRow(
                  theme.fg(
                    "dim",
                    "typ=filter · ↑↓ · →/enter=detail · tab=categorie · s=sort",
                  ),
                  innerWidth,
                ),
              );
              lines.push(
                wrapRow(
                  theme.fg("dim", "e=bewerken · n=nieuw · d=verwijderen · esc=sluiten"),
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
                "gebruikt",
                `${u?.count ?? 0}× · laatste ${formatLastUsed(u?.lastUsed ?? 0)}`,
              ),
            );
            lines.push(meta("bestand", e.filePath));
            lines.push(
              meta(
                "omvang",
                `${formatBytes(e.sizeBytes)} · ${e.lineCount} regels · gewijzigd ${formatLastUsed(e.mtimeMs)}`,
              ),
            );
            lines.push(
              meta(
                "frontmatter",
                e.frontmatterKeys.length
                  ? e.frontmatterKeys.join(", ")
                  : "(geen)",
              ),
            );
            if (e.disableModelInvocation) {
              lines.push(
                wrapRow(
                  theme.fg("warning", "model-invocatie uit — alleen handmatig"),
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
              lines.push(wrapRow(theme.fg("dim", "(lege body)"), innerWidth));
            }
            for (const line of shown) {
              lines.push(wrapRow(theme.fg("text", line || " "), innerWidth));
            }
            lines.push(border(`├${"─".repeat(innerWidth)}┤`));
            if (confirmDelete) {
              lines.push(
                wrapRow(
                  theme.fg("warning", `d opnieuw = verwijderen "${e.name}", andere toets = annuleren`),
                  innerWidth,
                ),
              );
            } else {
              lines.push(
                wrapRow(
                  theme.fg(
                    "dim",
                    "↑↓ scroll · enter= invoegen · e=bewerken · d=verwijderen · ←/esc=terug",
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
              if (data === "d" || matchesKey(data, "enter")) {
                const entry = selectedEntry();
                if (entry) doDelete(entry);
              } else {
                confirmDelete = false;
              }
            } else if (escape || data === "\x03") {
              close();
              return;
            } else if (data === "s") {
                sort = sort === "name" ? "usage" : "name";
                selected = 0;
              } else if (data === "e") {
                const entry = selectedEntry();
                if (entry) { appendToEditor(ctx, editorCommand(entry.filePath), "Edit-commando in de editor — enter draait 'm"); close(); return; }
              } else if (data === "n") {
                appendToEditor(ctx, `!mkdir -p ${join(getAgentPath("skills"), "<naam>")} && ${editorCommand(join(getAgentPath("skills"), "<naam>", "SKILL.md")).slice(1)}`, "Nieuwe skill: vervang <naam>, enter draait 'm"); close(); return;
              } else if (data === "d") {
                if (selectedEntry()) confirmDelete = true;
              } else if (isPrintable(data) || matchesKey(data, "backspace") || data === "\x15") {
              if (data === "\x15") query = "";
              else if (matchesKey(data, "backspace")) query = query.slice(0, -1);
              else query += data;
              selected = 0;
            } else if (up) {
              selected = selected === 0 ? f.length - 1 : selected - 1;
            } else if (down) {
              selected = selected === f.length - 1 ? 0 : selected + 1;
            } else if (matchesKey(data, "tab")) {
              const idx = CATEGORY_ORDER.indexOf(category);
              category = CATEGORY_ORDER[(idx + 1) % CATEGORY_ORDER.length]!;
              selected = 0;
            } else if (data === "s") {
              sort = sort === "name" ? "usage" : "name";
              selected = 0;
            } else if (data === "e") {
              const entry = selectedEntry();
              if (entry) {
                appendToEditor(
                  ctx,
                  editorCommand(entry.filePath),
                  "Edit-commando in de editor — enter draait 'm",
                );
                close();
                return;
              }
            } else if (data === "n") {
              appendToEditor(
                ctx,
                `!mkdir -p ${join(getAgentPath("skills"), "<naam>")} && ${editorCommand(join(getAgentPath("skills"), "<naam>", "SKILL.md")).slice(1)}`,
                "Nieuwe skill: vervang <naam>, enter draait 'm",
              );
              close();
              return;
            } else if (data === "d") {
              if (selectedEntry()) confirmDelete = true;
            } else if (matchesKey(data, "enter") || matchesKey(data, "right")) {
              const entry = selectedEntry();
              if (entry) openDetail(entry);
            }
          } else {
            // detail mode
            if (confirmDelete) {
              if (data === "d" || matchesKey(data, "enter")) {
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
            } else if (data === "e") {
              appendToEditor(
                ctx,
                editorCommand(detail!.filePath),
                "Edit-commando in de editor — enter draait 'm",
              );
              close();
              return;
            } else if (data === "d") {
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

/** Registreer de `/skills` command. */
export function registerSkillManagerCommand(
  pi: ExtensionAPI,
  rt: RuntimeState,
): void {
  pi.registerCommand("skills", {
    description: "Browse installed skills and insert one into your prompt",
    handler: async (_args: string, ctx: any) => {
      if (!rt.enabled || !ctx.hasUI) {
        ctx.ui.notify("Powerline UI is disabled", "info");
        return;
      }
      await showSkillManager(ctx);
    },
  });
}

// Re-export voor compatibiliteit met bestaande importers/tests.
export { listSkills, readSkillBody } from "./skill-registry.ts";
