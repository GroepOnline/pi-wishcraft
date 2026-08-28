/**
 * Fullscreen studio component (U5, KTD3). Non-overlay `ctx.ui.custom()` —
 * the editor-replacing variant, unlike the Deck's centered overlay. Panes are
 * placeholders here; U6-U10 fill list/detail/actions/advice content.
 */

import { matchesKey } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  createStudioState,
  handleStudioKey,
  STUDIO_PANES,
} from "./state.ts";
import type { StudioKeyEvent, StudioState } from "./types.ts";

const PANE_LABELS: Record<string, string> = {
  list: "Skills",
  detail: "Detail",
  actions: "Actions",
  advice: "AI Advice",
};

const HELP_LINES: readonly string[] = [
  "Skill Studio — keys",
  "",
  "  j / k or arrows   Move selection",
  "  /                 Filter skills",
  "  Tab               Cycle pane focus",
  "  ?                 Toggle this help",
  "  q / Esc           Exit studio",
];

export function mapRawInput(data: string): StudioKeyEvent {
  if (matchesKey(data, "escape")) return { key: "escape" };
  if (matchesKey(data, "return")) return { key: "return" };
  if (matchesKey(data, "tab")) return { key: "tab" };
  if (matchesKey(data, "up")) return { key: "up" };
  if (matchesKey(data, "down")) return { key: "down" };
  if (data === "\x7f" || data === "\b" || matchesKey(data, "backspace")) {
    return { key: "backspace" };
  }
  if (data.length === 1 && data >= " " && data <= "~") {
    return { key: "printable", char: data };
  }
  return { key: "other" };
}

export function renderStudioFrame(theme: Theme, width: number, state: StudioState): string[] {
  if (state.mode === "help") {
    const lines = [theme.fg("accent", HELP_LINES[0] ?? ""), ""];
    for (const line of HELP_LINES.slice(2)) {
      lines.push(theme.fg("muted", line));
    }
    lines.push("", theme.fg("dim", "Press q, Esc, or Enter to close help"));
    return lines;
  }

  const focusMark = (pane: string): string =>
    state.focus === pane ? theme.fg("accent", `[${PANE_LABELS[pane] ?? pane}]`) : theme.fg("dim", ` ${PANE_LABELS[pane] ?? pane} `);

  const header = STUDIO_PANES.map((pane) => focusMark(pane)).join(" ");
  const filterLine = state.mode === "filter"
    ? theme.fg("accent", `filter: ${state.filterQuery}_`)
    : state.filterQuery
      ? theme.fg("muted", `filter: ${state.filterQuery}`)
      : theme.fg("dim", "press / to filter, ? for help");

  const lines: string[] = [
    theme.fg("accent", "Skill Studio"),
    header,
    filterLine,
    theme.fg("dim", "─".repeat(Math.max(1, Math.min(width - 1, 60)))),
    theme.fg("muted", `selected: ${state.selectedIndex}`),
    theme.fg("dim", "panes populate in upcoming units (browse, actions, advice)"),
    theme.fg("dim", "─".repeat(Math.max(1, Math.min(width - 1, 60)))),
    theme.fg("dim", "q/Esc exit · / filter · Tab focus · ? help"),
  ];
  return lines;
}

export function createStudioComponent(
  theme: Theme,
  done: (value: string | null) => void,
  onStateChange?: (state: StudioState) => void,
) {
  let state = createStudioState();

  return {
    focused: true,
    invalidate() {},
    render(width: number) {
      return renderStudioFrame(theme, width, state);
    },
    handleInput(data: string) {
      const next = handleStudioKey(state, mapRawInput(data));
      if (next !== state) {
        state = next;
        onStateChange?.(state);
      }
      if (state.exitRequested) {
        done(null);
      }
    },
  };
}
