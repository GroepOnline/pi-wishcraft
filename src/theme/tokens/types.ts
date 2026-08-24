/**
 * src/theme/tokens/types.ts
 * ---------------------------------------------------------------------------
 * Semantic Design Tokens for Wishcraft (Crush pattern).
 * ---------------------------------------------------------------------------
 */

import type { ThemeColor } from "@earendil-works/pi-coding-agent";

export type ColorValue = ThemeColor | `#${string}`;

export interface WishcraftTokens {
  // Surfaces & Backgrounds
  surface: ColorValue;
  surfaceRaised: ColorValue;

  // Typography
  text: ColorValue;
  textMuted: ColorValue;

  // Brand & Accents
  primary: ColorValue;
  secondary: ColorValue;
  accent: ColorValue;

  // Feedback & State
  success: ColorValue;
  warning: ColorValue;
  error: ColorValue;

  // Interaction
  focus: ColorValue;
  selection: ColorValue;

  // Motion & Animation Channels
  motionDim: ColorValue;
  motionHot: ColorValue;
  motionTrail: ColorValue;
}
