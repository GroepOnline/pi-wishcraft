<<<<<<< HEAD
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
=======
export const DECK_ROUTES = [
  "home",
  "signal",
  "skills",
  "ideas",
  "guardrails",
  "shell",
  "usage",
  "appearance",
  "motion",
  "shortcuts",
  "diagnostics",
] as const;

export type DeckRoute = (typeof DECK_ROUTES)[number];
>>>>>>> a8c8687 (feat(deck): add unified Wishcraft Deck overlay with eleven routes (PR5))

export interface DeckRouteDef {
  id: DeckRoute;
  label: string;
<<<<<<< HEAD
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
=======
  jumpKey: string;
  description: string;
}

export interface DeckSessionSnapshot {
  modelLabel: string;
  branchLabel: string;
  contextPercent: number;
  contextTokens: number;
  contextWindow: number;
  signalActivity: string;
  signalMotion: string;
  queueCount: number;
  ideaCount: number;
  skillsTotal: number;
  skillsWarnings: number;
  policyEnabled: boolean;
  policyRuleCount: number;
  shellName: string | null;
  bashModeActive: boolean;
  appearanceBase: string;
  recentActivity: string[];
  nextIntent: string | null;
}

export interface DeckNavState {
  route: DeckRoute;
  selectedNav: number;
  searchOpen: boolean;
  searchQuery: string;
  pendingJump: string | null;
>>>>>>> a8c8687 (feat(deck): add unified Wishcraft Deck overlay with eleven routes (PR5))
}
