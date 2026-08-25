/**
 * Compatibility bridge for the canonical Wishcraft token mapping.
 * New code should import from src/config/tokens.ts.
 */

import type { ColorScheme, WishcraftTokens } from "../../config/types.ts";
import {
  DEFAULT_TOKENS as CANONICAL_DEFAULT_TOKENS,
  colorSchemeFromTokens,
  resolveTokens,
} from "../../config/tokens.ts";

export const DEFAULT_TOKENS: WishcraftTokens = CANONICAL_DEFAULT_TOKENS;

export function deriveColorSchemeFromTokens(tokens: WishcraftTokens): Required<ColorScheme> {
  return colorSchemeFromTokens(tokens);
}

export function createTokens(overrides?: Partial<WishcraftTokens>): WishcraftTokens {
  return resolveTokens(overrides);
}
