/**
 * src/extension/ui/deck/types.ts
 * ---------------------------------------------------------------------------
 * Types for the Wishcraft Deck Control Surface.
 * ---------------------------------------------------------------------------
 */

export type DeckRoute =
  | "home"
  | "signal"
  | "skills"
  | "ideas"
  | "guardrails"
  | "shell"
  | "usage"
  | "appearance"
  | "motion"
  | "shortcuts"
  | "diagnostics";

export interface DeckRouteDef {
  id: DeckRoute;
  label: string;
  glyph: string;
  shortcut?: string;
  description: string;
}

export interface DeckContext {
  activeRoute: DeckRoute;
  searchQuery: string;
  isSearching: boolean;
  activeMotionGlyph: string;
  sessionState: {
    model: string;
    branch: string;
    contextPct: number;
    activityStatus: string;
  };
}
