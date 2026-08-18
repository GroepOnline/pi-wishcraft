/**
 * skill-manager.ts
 * ---------------------------------------------------------------------------
 * Interactieve skill browser/manager als volledig eigen TUI-component.
 *
 * Bouwt voort op de pi-tui SelectList, maar exposeert een 2-modus overlay:
 *   - lijst  : filterbaar overzicht van alle ontdekte skills (enter → detail)
 *   - detail : de skill-beschrijving + body, scrollable (enter → insert in editor)
 *
 * Gebruik: `/skills` opent de manager.
 * ---------------------------------------------------------------------------
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  type SelectItem,
  SelectList,
  matchesKey,
  truncateToWidth,
} from "@earendil-works/pi-tui";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { RuntimeState } from "../core/types.ts";
import { parseSkillFrontmatter, stripFrontmatter } from "../../core/frontmatter.ts";
import { getAvailableSkills } from "./inline-invocation.ts";
import { overlaySelectListTheme } from "../ui/menu-views.ts";

export interface SkillInfo {
  name: string;
  description: string;
  path: string;
  source: string;
}

/** Verzamel alle ontdekte skills met hun frontmatter-metadata. */
export function listSkills(): SkillInfo[] {
  const skills: SkillInfo[] = [];
  for (const [name, path] of getAvailableSkills()) {
    let description = "";
    try {
      const raw = readFileSync(path, "utf-8");
      description = parseSkillFrontmatter(raw).description ?? "";
    } catch {
      // best-effort: zonder metadata blijft de beschrijving leeg
    }
    skills.push({ name, description, path, source: dirname(path) });
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

/** Lees de skill-inhoud zonder frontmatter. */
export function readSkillBody(path: string): string {
  try {
    return stripFrontmatter(readFileSync(path, "utf-8")).trim();
  } catch {
    return "";
  }
}

/** Apply a keypress to the skill list filter string. */
export function applySkillFilterKey(
  filter: string,
  data: string,
): { filter: string; consumed: boolean } {
  if (data === "\x15") {
    return { filter: "", consumed: true };
  }
  if (data === "\x7f" || data === "\b" || matchesKey(data, "delete")) {
    if (filter.length === 0) return { filter, consumed: false };
    return { filter: filter.slice(0, -1), consumed: true };
  }
  if (data.length === 1 && data.charCodeAt(0) >= 32) {
    return { filter: filter + data, consumed: true };
  }
  return { filter, consumed: false };
}

function insertSkillBody(ctx: any, body: string): void {
  const current = ctx.ui.getEditorText?.() ?? "";
  const separator = current && !current.endsWith("\n") ? "\n\n" : "";
  ctx.ui.setEditorText(`${current}${separator}${body}\n`);
  ctx.ui.notify("Skill inserted into prompt", "info");
}

/**
 * De eigen interactieve skill-manager overlay (lijst ⇄ detail).
 */
export async function showSkillManager(ctx: any): Promise<void> {
  const skills = listSkills();
  if (skills.length === 0) {
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
      let activeSkill: SkillInfo | null = null;
      let body: string[] = [];
      let scroll = 0;
      let filter = "";
      const BODY_ROWS = 16;

      const items: SelectItem[] = skills.map((s) => ({
        value: s.name,
        label: s.name,
        description: s.description || undefined,
      }));
      const selectList = new SelectList(
        items,
        Math.min(items.length, 15),
        overlaySelectListTheme(theme),
      );

      selectList.onSelect = (item) => {
        activeSkill = skills.find((s) => s.name === item.value) ?? null;
        body = activeSkill ? readSkillBody(activeSkill.path).split("\n") : [];
        scroll = 0;
        mode = "detail";
        tui.requestRender();
      };
      selectList.onCancel = () => done(null);

      return {
        render: (width: number) => {
          const innerWidth = Math.max(1, width - 2);
          const lines: string[] = [];
          lines.push(border(`╭${"─".repeat(innerWidth)}╮`));

          if (mode === "list") {
            lines.push(
              wrapRow(
                theme.fg("accent", theme.bold(`Skills · ${skills.length}`)),
                innerWidth,
              ),
            );
            lines.push(border(`├${"─".repeat(innerWidth)}┤`));
            for (const line of selectList.render(innerWidth)) {
              lines.push(wrapRow(line, innerWidth));
            }
            lines.push(border(`├${"─".repeat(innerWidth)}┤`));
            lines.push(
              wrapRow(
                theme.fg(
                  "dim",
                  "type to filter · ↑↓ navigate · enter view · esc close",
                ),
                innerWidth,
              ),
            );
          } else if (activeSkill) {
            lines.push(
              wrapRow(
                theme.fg("accent", theme.bold(`Skill · ${activeSkill.name}`)),
                innerWidth,
              ),
            );
            if (activeSkill.description) {
              lines.push(
                wrapRow(theme.fg("muted", activeSkill.description), innerWidth),
              );
            }
            lines.push(border(`├${"─".repeat(innerWidth)}┤`));
            const shown = body.slice(scroll, scroll + BODY_ROWS);
            if (shown.length === 0) {
              lines.push(wrapRow(theme.fg("dim", "(no body)"), innerWidth));
            }
            for (const line of shown) {
              lines.push(wrapRow(theme.fg("text", line || " "), innerWidth));
            }
            lines.push(border(`├${"─".repeat(innerWidth)}┤`));
            const scrollHint = [
              scroll > 0 ? "↑ scroll" : "",
              body.length > scroll + BODY_ROWS ? "↓ scroll" : "",
            ]
              .filter(Boolean)
              .join(" ");
            lines.push(
              wrapRow(
                theme.fg(
                  "dim",
                  `${scrollHint}${scrollHint ? " · " : ""}enter insert · esc back`,
                ),
                innerWidth,
              ),
            );
          }

          lines.push(border(`╰${"─".repeat(innerWidth)}╯`));
          return lines;
        },
        invalidate: () => selectList.invalidate(),
        handleInput: (data: string) => {
          if (mode === "detail") {
            const isEscape =
              matchesKey(data, "escape") ||
              matchesKey(data, "esc") ||
              data === "\x1b";
            if (isEscape) {
              mode = "list";
            } else if (matchesKey(data, "up")) {
              scroll = Math.max(0, scroll - 1);
            } else if (matchesKey(data, "down")) {
              scroll = Math.min(
                Math.max(0, body.length - BODY_ROWS),
                scroll + 1,
              );
            } else if (
              matchesKey(data, "enter") ||
              matchesKey(data, "tab") ||
              matchesKey(data, "space")
            ) {
              if (activeSkill) {
                insertSkillBody(ctx, readSkillBody(activeSkill.path));
              }
              done(null);
              return;
            }
          } else {
            const result = applySkillFilterKey(filter, data);
            if (result.consumed) {
              filter = result.filter;
              selectList.setFilter(filter);
            } else {
              selectList.handleInput(data);
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
