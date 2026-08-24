/**
 * src/theme/tokens/mapping.ts
 * ---------------------------------------------------------------------------
 * Default token mapping and legacy SemanticColor bridge for Wishcraft.
 * ---------------------------------------------------------------------------
 */

import type { ColorScheme, SemanticColor } from "../../config/types.ts";
import type { WishcraftTokens } from "./types.ts";

export const DEFAULT_TOKENS: WishcraftTokens = {
  surface: "#0f172a",
  surfaceRaised: "#1e293b",
  text: "#f8fafc",
  textMuted: "dim",
  primary: "#f59e0b",
  secondary: "#00afaf",
  accent: "#ea580c",
  success: "success",
  warning: "warning",
  error: "error",
  focus: "#38bdf8",
  selection: "#334155",
  motionDim: "dim",
  motionHot: "#fbbf24",
  motionTrail: "#78350f",
};

/**
 * Derives legacy SemanticColor configuration from modern WishcraftTokens.
 */
export function deriveColorSchemeFromTokens(tokens: WishcraftTokens): Required<ColorScheme> {
  return {
    model: tokens.primary,
    shellMode: tokens.accent,
    path: tokens.secondary,
    gitClean: tokens.success,
    gitDirty: tokens.warning,
    thinking: "thinkingOff",
    thinkingMinimal: "thinkingMinimal",
    thinkingLow: "thinkingLow",
    thinkingMedium: "thinkingMedium",
    context: tokens.textMuted,
    contextWarn: tokens.warning,
    contextError: tokens.error,
    cost: tokens.text,
    tokens: tokens.textMuted,
    queue: tokens.accent,
    separator: tokens.textMuted,
    border: tokens.surfaceRaised,
  };
}

/**
 * Creates WishcraftTokens by merging overrides onto defaults.
 */
export function createTokens(overrides?: Partial<WishcraftTokens>): WishcraftTokens {
  return {
    ...DEFAULT_TOKENS,
    ...overrides,
  };
}
