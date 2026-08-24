/**
 * tokens.ts
 * ---------------------------------------------------------------------------
 * Semantic design tokens for Wishcraft vNext.
 *
 * The existing ColorScheme is segment-shaped: `model`, `gitDirty`, `context`,
 * `cost`. That ties colors to concrete segments, so a new surface (Deck, Signal
 * lanes, motion trails) has nowhere to get its color from except a fresh hex
 * literal. Tokens invert that: a preset fills abstract roles, and the legacy
 * semantic colors are derived from them.
 *
 * Existing presets keep working unchanged. `DEFAULT_TOKENS` is chosen so that
 * `colorSchemeFromTokens(DEFAULT_TOKENS)` equals `getDefaultColors()`, and any
 * explicit `colors` a preset already declares still wins over the derived value.
 * ---------------------------------------------------------------------------
 */

import type {
  ColorScheme,
  ColorValue,
  PresetDef,
  SemanticColor,
  TokenRole,
  WishcraftTokens,
} from "./types.ts";

export type { TokenRole, WishcraftTokens };

/**
 * Which token each legacy semantic color reads from.
 *
 * `thinking*` is deliberately absent: those four are Pi's own thinking-level
 * colors, not part of the Wishcraft palette, so they pass through untouched.
 */
export const SEMANTIC_TOKEN_ROLE: Record<
  Exclude<SemanticColor, "thinking" | "thinkingMinimal" | "thinkingLow" | "thinkingMedium">,
  TokenRole
> = {
  model: "primary",
  shellMode: "accent",
  path: "secondary",
  gitDirty: "warning",
  gitClean: "success",
  context: "motionDim",
  contextWarn: "warning",
  contextError: "error",
  cost: "text",
  tokens: "textMuted",
  queue: "accent",
  separator: "motionDim",
  border: "surfaceRaised",
};

/** Pi thinking-level colors, passed through rather than tokenised. */
export const THINKING_COLORS: Pick<
  Required<ColorScheme>,
  "thinking" | "thinkingMinimal" | "thinkingLow" | "thinkingMedium"
> = {
  thinking: "thinkingOff",
  thinkingMinimal: "thinkingMinimal",
  thinkingLow: "thinkingLow",
  thinkingMedium: "thinkingMedium",
};

/**
 * Token values that reproduce today's default color scheme exactly, so
 * switching a preset to tokens is not a visual change.
 */
export const DEFAULT_TOKENS: WishcraftTokens = {
  surface: "background" as ColorValue,
  surfaceRaised: "borderMuted",
  text: "text",
  textMuted: "muted",
  primary: "#d787af",
  secondary: "#00afaf",
  accent: "accent",
  success: "success",
  warning: "warning",
  error: "error",
  focus: "borderAccent",
  selection: "borderMuted",
  motionDim: "dim",
  motionHot: "accent",
  motionTrail: "muted",
};

/** Derive the full legacy color scheme from a token set. */
export function colorSchemeFromTokens(tokens: WishcraftTokens): Required<ColorScheme> {
  const derived = {} as Required<ColorScheme>;
  for (const [semantic, role] of Object.entries(SEMANTIC_TOKEN_ROLE) as Array<
    [keyof typeof SEMANTIC_TOKEN_ROLE, TokenRole]
  >) {
    derived[semantic] = tokens[role];
  }
  return { ...derived, ...THINKING_COLORS };
}

/**
 * Colors for a preset that declares tokens. Explicit `colors` entries win, so a
 * preset can tokenise its palette and still pin one segment by hand.
 */
export function mergeTokenColors(
  tokens: WishcraftTokens,
  overrides?: ColorScheme,
): Required<ColorScheme> {
  const derived = colorSchemeFromTokens(tokens);
  if (!overrides) return derived;

  const merged = { ...derived };
  for (const key of Object.keys(overrides) as SemanticColor[]) {
    const value = overrides[key];
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

/**
 * Colors a preset should render with.
 *
 * Presets that declare tokens get their scheme derived from them; presets that
 * predate tokens keep their explicit `colors` (or the default scheme) untouched.
 */
export function presetColorScheme(
  preset: Pick<PresetDef, "colors" | "tokens">,
  defaults: () => Required<ColorScheme>,
): ColorScheme {
  if (preset.tokens) {
    return mergeTokenColors(resolveTokens(preset.tokens), preset.colors);
  }
  return preset.colors ?? defaults();
}

/** Read one token, falling back to the default palette. */
export function token(
  role: TokenRole,
  tokens?: Partial<WishcraftTokens>,
): ColorValue {
  return tokens?.[role] ?? DEFAULT_TOKENS[role];
}

/** Fill the gaps in a partial token set. */
export function resolveTokens(partial?: Partial<WishcraftTokens>): WishcraftTokens {
  if (!partial) return { ...DEFAULT_TOKENS };
  return { ...DEFAULT_TOKENS, ...stripUndefined(partial) };
}

function stripUndefined(partial: Partial<WishcraftTokens>): Partial<WishcraftTokens> {
  const clean: Partial<WishcraftTokens> = {};
  for (const key of Object.keys(partial) as TokenRole[]) {
    const value = partial[key];
    if (value !== undefined) clean[key] = value;
  }
  return clean;
}
