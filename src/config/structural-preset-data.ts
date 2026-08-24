/**
 * structural-preset-data.ts
 * ---------------------------------------------------------------------------
 * Shared helpers and chrome/deck constants for the ten structural presets.
 * The preset definitions live in structural-preset-table.ts; the public API
 * (getStructuralPreset, etc.) lives in structural-presets.ts.
 * ---------------------------------------------------------------------------
 */

import type { ChromeSpec, DeckSpec, MotionRef, WishcraftTokens } from "./types.ts";
import type { MotionEvent } from "../motion/types.ts";

export function tokens(partial: Partial<WishcraftTokens>): Partial<WishcraftTokens> {
  return partial;
}

export function motion(
  signature: MotionRef,
  overrides?: Partial<Record<MotionEvent, MotionRef>>,
): Partial<Record<MotionEvent, MotionRef>> {
  const base: Partial<Record<MotionEvent, MotionRef>> = {
    idle: "wisp",
    thinking: signature,
    streaming: signature,
    "tool.start": signature,
    "tool.end": "rune-bloom",
    "idea.capture": "rune-bloom",
    "skill.insert": "rune-bloom",
    "policy.deny": "rune-bloom",
    repair: signature,
    compact: "bar",
    success: "rune-bloom",
    warning: "rune-bloom",
    error: "rune-bloom",
  };
  return { ...base, ...overrides };
}

export const ROUNDED_CHROME: ChromeSpec = {
  frame: "rounded",
  corners: { tl: "╭", tr: "╮", bl: "╰", br: "╯" },
  dividers: { horizontal: "─", vertical: "│", cross: "┼" },
  density: "medium",
};

export const MINIMAL_CHROME: ChromeSpec = {
  frame: "minimal",
  corners: { tl: " ", tr: " ", bl: " ", br: " " },
  dividers: { horizontal: "─", vertical: " ", cross: " " },
  density: "spacious",
};

export const BORDERLESS_CHROME: ChromeSpec = {
  frame: "borderless",
  corners: { tl: "", tr: "", bl: "", br: "" },
  dividers: { horizontal: "─", vertical: " ", cross: " " },
  density: "spacious",
};

export const DEFAULT_DECK: DeckSpec = {
  navigation: "tabs",
  panelStyle: "framed",
  activityStyle: "pulse",
};
