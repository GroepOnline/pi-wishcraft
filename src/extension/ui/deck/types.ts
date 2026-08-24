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
  motionLevel: string;
  policySummary: string;
  skills: DeckSkillRow[];
  ideas: DeckIdeaRow[];
  guardrailRules: DeckGuardrailRow[];
}

export interface DeckSkillRow {
  name: string;
  category: string;
  status: string;
  description: string;
  usage: number;
}

export interface DeckIdeaRow {
  text: string;
  reviewStatus: string;
}

export interface DeckGuardrailRow {
  action: string;
  tool: string;
  reason: string;
}

export interface DeckNavState {
  route: DeckRoute;
  selectedNav: number;
  searchOpen: boolean;
  searchQuery: string;
  pendingJump: string | null;
  /** Cursor into STRUCTURAL_PRESET_NAMES on the Appearance route. */
  selectedAppearance: number;
  selectedMotion: number;
  selectedSkill: number;
  selectedIdea: number;
  composerOpen: boolean;
  composerField: number;
  assignEvent: import("../../../motion/types.ts").MotionEvent;
  skillCreate: boolean;
  skillCreateName: string;
}
