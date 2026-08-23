/**
 * src/extension/ui/deck/types.ts
 * ---------------------------------------------------------------------------
 * Types for the Wishcraft Deck control surface.
 * ---------------------------------------------------------------------------
 */

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

export interface DeckRouteDef {
  id: DeckRoute;
  label: string;
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
  /** Cursor into STRUCTURAL_PRESET_NAMES on the Appearance route. */
  selectedAppearance: number;
}
