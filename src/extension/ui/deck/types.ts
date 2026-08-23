/**
 * Types for the Wishcraft Deck control surface.
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

export type AppearancePane =
  | "presets"
  | "palette"
  | "signal"
  | "motion"
  | "glyphs"
  | "layout"
  | "accessibility";

export const APPEARANCE_PANES: readonly AppearancePane[] = [
  "presets",
  "palette",
  "signal",
  "motion",
  "glyphs",
  "layout",
  "accessibility",
];

export interface DeckRouteDef {
  id: DeckRoute;
  label: string;
  jumpKey: string;
  description: string;
  glyph?: string;
  shortcut?: string;
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
  skillSummaries?: DeckSkillSummary[];
  terminal?: DeckTerminalSnapshot;
}

export interface DeckSkillSummary {
  name: string;
  description: string;
  category: string;
  warning?: string;
  usageCount: number;
}

export interface DeckTerminalSnapshot {
  term: string;
  noColor: boolean;
  truecolor: boolean;
  lowColor: boolean;
  screenReader: boolean;
  reducedMotion: boolean;
  motionLevel: string;
}

export interface DeckAppearanceState {
  pane: AppearancePane;
  selected: number;
  query: string;
  composerOpen: boolean;
  previewTick: number;
  playing: boolean;
  favorites: string[];
}

export interface DeckSkillsState {
  selected: number;
  wizardOpen: boolean;
  previewScroll: number;
  wizard?: import("../../skills/workbench.ts").SkillWizardState;
}

export interface DeckNavState {
  route: DeckRoute;
  selectedNav: number;
  searchOpen: boolean;
  searchQuery: string;
  pendingJump: string | null;
  appearance?: DeckAppearanceState;
  skills?: DeckSkillsState;
}

export function defaultAppearanceState(): DeckAppearanceState {
  return {
    pane: "presets",
    selected: 0,
    query: "",
    composerOpen: false,
    previewTick: 0,
    playing: false,
    favorites: [],
  };
}

export function defaultSkillsState(): DeckSkillsState {
  return {
    selected: 0,
    wizardOpen: false,
    previewScroll: 0,
  };
}

export function normalizeDeckNavState(state: DeckNavState): Required<DeckNavState> {
  return {
    ...state,
    appearance: state.appearance ?? defaultAppearanceState(),
    skills: state.skills ?? defaultSkillsState(),
  };
}
