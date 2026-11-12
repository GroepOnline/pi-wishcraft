/** Skill-manager list/detail renderer — pure view over the panel state. */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

import type { getSkillUsage, SkillCategory, SkillEntry } from "./skill-registry.ts";
import {
  CATEGORY_LABELS,
  DETAIL_ROWS,
  LIST_ROWS,
  filteredEntries,
  formatBytes,
  formatLastUsed,
  selectedEntry,
  type SkillManagerViewState,
} from "./skill-manager-utils.ts";

export function renderSkillManagerView(
  state: SkillManagerViewState,
  deps: {
    entries: SkillEntry[];
    usage: ReturnType<typeof getSkillUsage>;
    theme: Theme;
  },
  width: number,
): string[] {
  const { entries, usage, theme } = deps;
  const border = (text: string) => theme.fg("dim", text);
  const wrapRow = (text: string, innerWidth: number): string =>
    `${border("│")}${truncateToWidth(text, innerWidth, "…", true)}${border("│")}`;

  const innerWidth = Math.max(1, width - 2);
  const lines: string[] = [];
  lines.push(border(`╭${"─".repeat(innerWidth)}╮`));

  if (state.mode === "list") {
    const f = filteredEntries(state, entries, usage);
    // Header: total + sort + live filter
    const head = `Skills · ${f.length}/${entries.length} · ${state.sort === "name" ? "name" : "usage"} · ${CATEGORY_LABELS[state.category]}${state.query ? ` · search "${state.query}"` : ""}`;
    lines.push(wrapRow(theme.fg("accent", theme.bold(head)), innerWidth));
    lines.push(border(`├${"─".repeat(innerWidth)}┤`));

    if (f.length === 0) {
      const emptyMsg =
        entries.length === 0 && !state.query
          ? "No skills installed — ctrl+n to create one"
          : `No skills for "${state.query}"`;
      lines.push(
        wrapRow(theme.fg("warning", emptyMsg), innerWidth),
      );
    } else {
      // scroll window around the selection
      const start = Math.max(
        0,
        Math.min(state.selected - Math.floor(LIST_ROWS / 2), f.length - LIST_ROWS),
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
        const isSel = i === state.selected;
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
            theme.fg("dim", `(${state.selected + 1}/${f.length})`),
            innerWidth,
          ),
        );
      }
    }

    lines.push(border(`├${"─".repeat(innerWidth)}┤`));
    if (state.confirmDelete) {
      lines.push(
        wrapRow(
          theme.fg(
            "warning",
            `ctrl+d or enter = delete "${selectedEntry(state, entries, usage)?.name ?? ""}", any other key cancels`,
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
  } else if (state.detail) {
    const e = state.detail;
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
    const shown = state.bodyLines.slice(state.scroll, state.scroll + DETAIL_ROWS);
    if (shown.length === 0 || shown.join("").trim() === "") {
      lines.push(wrapRow(theme.fg("dim", "(empty body)"), innerWidth));
    }
    for (const line of shown) {
      lines.push(wrapRow(theme.fg("text", line || " "), innerWidth));
    }
    lines.push(border(`├${"─".repeat(innerWidth)}┤`));
    if (state.confirmDelete) {
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
}
