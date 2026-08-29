/** Studio domain types (U5). Kept UI-free; state.ts is the pure reducer. */

export type StudioPaneId = "list" | "detail" | "actions" | "advice";

export type StudioMode = "normal" | "filter" | "confirm" | "help";

export interface StudioState {
  mode: StudioMode;
  focus: StudioPaneId;
  selectedIndex: number;
  filterQuery: string;
  /** Pending destructive confirmation text (set by U7 actions). */
  confirmText: string | null;
  exitRequested: boolean;
}

export type StudioKeyKind =
  | "escape"
  | "return"
  | "tab"
  | "up"
  | "down"
  | "backspace"
  | "printable"
  | "other";

export interface StudioKeyEvent {
  key: StudioKeyKind;
  char?: string;
}
