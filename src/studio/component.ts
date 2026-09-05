/** Fullscreen Skill Studio workbench. The component owns presentation and input;
 * the existing skills modules remain the only discovery and mutation backend. */

import { matchesKey } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  buildListRows,
  filterListRows,
} from "./list.ts";
import { resolveReferences, type ResolvedReference } from "./inspect.ts";
import { readSkillBody, type SkillEntry, type SkillUsage } from "../extension/skills/skill-registry.ts";
import type { AdvicePane } from "./advice-pane.ts";
import type { AdviseMode } from "./advise/prompts.ts";
import {
  createStudioState,
  handleStudioKey,
  STUDIO_PANES,
} from "./state.ts";
import type { StudioKeyEvent, StudioPaneId, StudioState } from "./types.ts";

const PANE_LABELS: Record<StudioPaneId, string> = {
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
  "  Tab or 1-4        Focus a pane",
  "  Enter             Open the selected skill",
  "  n                 Create a skill",
  "  e                 Edit the selected skill",
  "  d                 Run doctor",
  "  a                 Focus AI advice",
  "  r                 Run advice · i insert answer",
  "  ?                 Toggle this help",
  "  q / Esc           Exit studio",
];

export interface StudioComponentOptions {
  entries?: readonly SkillEntry[];
  usage?: ReadonlyMap<string, SkillUsage>;
  advicePane?: AdvicePane;
  adviceMode?: AdviseMode;
  onRefresh?: () => readonly SkillEntry[];
  onCreate?: () => Promise<void> | void;
  onEdit?: (entry: SkillEntry) => Promise<void> | void;
  onDoctor?: () => Promise<void> | void;
  onAdvice?: (entry: SkillEntry, mode: AdviseMode, pane: AdvicePane) => Promise<void> | void;
  onInsert?: (pane: AdvicePane) => Promise<void> | void;
  onError?: (error: unknown) => void;
}

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

function fit(text: string, width: number): string {
  if (width <= 0) return "";
  return text.length <= width ? text : `${text.slice(0, Math.max(0, width - 1))}…`;
}

function safeReadReferences(entry: SkillEntry): ResolvedReference[] {
  return resolveReferences(readSkillBody(entry.filePath), entry.baseDir);
}

function selectedEntry(
  entries: readonly SkillEntry[],
  query: string,
  selectedIndex: number,
): SkillEntry | null {
  const rows = filterListRows(buildListRows(entries), query);
  const row = rows[selectedIndex] ?? rows[0];
  return entries.find((entry) => entry.filePath === row?.filePath) ?? null;
}

function renderHelp(theme: Theme): string[] {
  return HELP_LINES.map((line, index) => {
    if (index === 0) return theme.fg("accent", line);
    return theme.fg(index === HELP_LINES.length - 1 ? "dim" : "muted", line);
  });
}

function renderList(
  theme: Theme,
  width: number,
  entries: readonly SkillEntry[],
  state: StudioState,
): string[] {
  const rows = filterListRows(buildListRows(entries), state.filterQuery);
  const visible = rows.slice(Math.max(0, state.selectedIndex - 5), state.selectedIndex + 7);
  const lines = [theme.fg("accent", `SKILLS · ${rows.length}/${entries.length}`)];
  if (state.filterQuery) lines.push(theme.fg("muted", `filter: ${state.filterQuery}`));
  if (rows.length === 0) {
    lines.push(theme.fg("warning", "No skills match this filter"));
    return lines;
  }
  for (const row of visible) {
    const absolute = rows.indexOf(row);
    const marker = absolute === state.selectedIndex ? "›" : " ";
    const warning = row.warning ? theme.fg("warning", " ⚠") : "";
    lines.push(
      `${theme.fg(absolute === state.selectedIndex ? "accent" : "text", `${marker} ${fit(row.name, Math.max(8, width - 18))}`)} ${theme.fg("dim", `[${row.badge}]`)}${warning}`,
    );
    if (absolute === state.selectedIndex && row.description) {
      lines.push(theme.fg("muted", `  ${fit(row.description, Math.max(8, width - 4))}`));
    }
  }
  return lines;
}

function renderDetail(theme: Theme, width: number, entry: SkillEntry | null, usage: ReadonlyMap<string, SkillUsage>): string[] {
  if (!entry) return [theme.fg("accent", "DETAIL"), theme.fg("dim", "Select a skill from the list")];
  const body = readSkillBody(entry.filePath);
  const refs = safeReadReferences(entry);
  const use = usage.get(entry.name);
  const health = entry.warning ? theme.fg("warning", "warn") : theme.fg("success", "ok");
  const override = entry.category === "project" ? "project override" : entry.category === "global" ? "global default" : "standalone";
  const lines = [
    theme.fg("accent", `DETAIL · ${fit(entry.name, Math.max(8, width - 10))}`),
    theme.fg("muted", fit(entry.description || "No description", width)),
    theme.fg("dim", `health: ${health} · ${override} · used: ${use?.count ?? 0}×`),
    theme.fg("dim", `file: ${fit(entry.filePath, Math.max(8, width - 6))}`),
    theme.fg("dim", `frontmatter: ${entry.frontmatterKeys.join(", ") || "none"}`),
    theme.fg("dim", `model invocation: ${entry.disableModelInvocation ? "off" : "on"}`),
    theme.fg("accent", `REFERENCES · ${refs.length}`),
  ];
  if (refs.length === 0) lines.push(theme.fg("dim", "  none detected"));
  for (const ref of refs.slice(0, 5)) {
    lines.push(theme.fg(ref.exists ? "muted" : "warning", `  ${ref.exists ? "✓" : "✗"} ${fit(ref.href, Math.max(8, width - 6))}`));
  }
  return lines;
}

function adviceModeLabel(mode: AdviseMode): string {
  return mode === "explain" ? "explain" : mode === "integrate" ? "integrate" : mode === "examples" ? "examples" : "improve";
}

function renderAdvice(theme: Theme, width: number, entry: SkillEntry | null, pane: AdvicePane, mode: AdviseMode): string[] {
  const lines = [
    theme.fg("accent", `AI ADVICE · ${adviceModeLabel(mode)}`),
    entry ? theme.fg("muted", `skill: ${entry.name}`) : theme.fg("dim", "Select a skill first"),
    theme.fg("dim", "r run · e explain · g integrate · x examples · m improve · i insert"),
  ];
  if (pane.state === "running") lines.push(theme.fg("accent", "Thinking…"));
  if (pane.state === "unavailable") lines.push(theme.fg("warning", `Advice unavailable: ${pane.error ?? "unknown error"}`));
  const text = pane.text.trim();
  if (text) {
    lines.push(theme.fg("text", fit(text.replace(/\n/g, " "), Math.max(8, width - 2))));
  } else if (pane.state === "idle") {
    lines.push(theme.fg("dim", "Advice uses the selected skill and its local references."));
  }
  return lines;
}

export function renderStudioFrame(
  theme: Theme,
  width: number,
  state: StudioState,
  options: Pick<StudioComponentOptions, "entries" | "usage" | "advicePane" | "adviceMode"> = {},
): string[] {
  if (state.mode === "help") return renderHelp(theme);
  const entries = options.entries ?? [];
  const usage = options.usage ?? new Map<string, SkillUsage>();
  const pane = options.advicePane ?? { state: "idle", text: "", error: null } as AdvicePane;
  const entry = selectedEntry(entries, state.filterQuery, state.selectedIndex);
  const mode: AdviseMode = options.adviceMode ?? "explain";
  const innerWidth = Math.max(20, width - 2);
  const lines = [
    theme.fg("accent", "Skill Studio"),
    STUDIO_PANES.map((paneId) => state.focus === paneId ? theme.fg("accent", `[${PANE_LABELS[paneId]}]`) : theme.fg("dim", ` ${PANE_LABELS[paneId]} `)).join(" "),
    theme.fg("dim", "─".repeat(Math.max(1, Math.min(innerWidth, 72)))),
  ];
  lines.push(...renderList(theme, innerWidth, entries, state));
  lines.push(theme.fg("dim", "─".repeat(Math.max(1, Math.min(innerWidth, 72)))));
  lines.push(...renderDetail(theme, innerWidth, entry, usage));
  lines.push(theme.fg("dim", "─".repeat(Math.max(1, Math.min(innerWidth, 72)))));
  lines.push(theme.fg("accent", "ACTIONS"));
  lines.push(theme.fg("muted", "n create · e edit · d doctor · Enter detail"));
  lines.push(theme.fg("dim", "─".repeat(Math.max(1, Math.min(innerWidth, 72)))));
  lines.push(...renderAdvice(theme, innerWidth, entry, pane, mode));
  lines.push(theme.fg("dim", "─".repeat(Math.max(1, Math.min(innerWidth, 72)))));
  lines.push(theme.fg("dim", "q/Esc exit · / filter · Tab focus · ? help"));
  return lines;
}

export function createStudioComponent(
  theme: Theme,
  done: (value: string | null) => void,
  onStateChange?: (state: StudioState) => void,
  options: StudioComponentOptions = {},
) {
  let state = createStudioState();
  let entries = [...(options.entries ?? [])];
  let adviceMode: AdviseMode = "explain";
  let finished = false;
  const pane = options.advicePane ?? {
    state: "idle",
    text: "",
    error: null,
    run: async () => {},
    reset: () => {},
  } as AdvicePane;

  const refresh = () => {
    const next = options.onRefresh?.();
    if (next) entries = [...next];
  };
  const current = () => selectedEntry(entries, state.filterQuery, state.selectedIndex);
  const notifyChange = (next: StudioState) => {
    state = next;
    onStateChange?.(state);
  };
  const invoke = (work: () => Promise<void> | void) => {
    void Promise.resolve(work()).then(() => {
      refresh();
    }).catch((error: unknown) => options.onError?.(error));
  };
  const focus = (paneId: StudioPaneId) => notifyChange({ ...state, focus: paneId });
  const runAdvice = () => {
    const entry = current();
    if (!entry || !options.onAdvice) return;
    invoke(() => options.onAdvice!(entry, adviceMode, pane));
  };

  return {
    focused: true,
    invalidate() {},
    render(width: number) {
      return renderStudioFrame(theme, width, state, { entries, usage: options.usage, advicePane: pane, adviceMode });
    },
    handleInput(data: string) {
      if (state.mode === "normal") {
        if (data >= "1" && data <= "4") {
          focus(STUDIO_PANES[Number(data) - 1] ?? "list");
          return;
        }
        if (data === "\r" || matchesKey(data, "return")) {
          if (state.focus === "list") focus("detail");
          return;
        }
        if (state.focus === "advice") {
          if (data === "e") adviceMode = "explain";
          else if (data === "g") adviceMode = "integrate";
          else if (data === "x") adviceMode = "examples";
          else if (data === "m") adviceMode = "improve";
          else if (data === "r") runAdvice();
          else if (data === "i" && options.onInsert) invoke(() => options.onInsert!(pane));
        } else if (state.focus === "actions" || state.focus === "detail" || state.focus === "list") {
          if (data === "n" && options.onCreate) invoke(() => options.onCreate!());
          else if (data === "e" && current() && options.onEdit) invoke(() => options.onEdit!(current()!));
          else if (data === "d" && options.onDoctor) invoke(() => options.onDoctor!());
          else if (data === "a") focus("advice");
          else if (data === "i" && pane.state === "ok" && options.onInsert) invoke(() => options.onInsert!(pane));
          else if (state.focus === "detail" && data === "r") runAdvice();
        }
      }
      const next = handleStudioKey(state, mapRawInput(data));
      if (next !== state) notifyChange(next);
      if (state.exitRequested && !finished) {
        finished = true;
        done(null);
      }
    },
  };
}
