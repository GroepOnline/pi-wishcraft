/**
 * appearance.ts
 * ---------------------------------------------------------------------------
 * Mixable appearance resolution for Wishcraft vNext. Users can pair any
 * structural preset base with independent palette, signal layout, chrome,
 * glyph, deck, welcome, and motion layers.
 * ---------------------------------------------------------------------------
 */

import type {
  AppearanceMixConfig,
  ChromeSpec,
  DeckSpec,
  GlyphSet,
  MotionRef,
  ResolvedAppearance,
  SignalSpec,
  StructuralPresetName,
  WelcomeSpec,
  WishcraftTokens,
} from "./types.ts";
import type { MotionEvent } from "../motion/types.ts";
import { getMotion } from "../motion/catalog.ts";
import { resolveTokens } from "./tokens.ts";
import { STRUCTURAL_PRESETS, getStructuralPreset } from "./structural-presets.ts";

function layerPreset(
  config: AppearanceMixConfig,
  key: keyof Pick<
    AppearanceMixConfig,
    "palette" | "signalLayout" | "chrome" | "glyphs" | "deck" | "welcome"
  >,
  base: StructuralPresetName,
): StructuralPresetName {
  return config[key] ?? base;
}

function resolveMotionLayer(
  config: AppearanceMixConfig,
  base: StructuralPresetName,
): Partial<Record<MotionEvent, MotionRef>> {
  if (!config.motion) {
    return { ...STRUCTURAL_PRESETS[base].motion };
  }
  if (typeof config.motion === "string") {
    return { ...STRUCTURAL_PRESETS[config.motion].motion };
  }
  return { ...STRUCTURAL_PRESETS[base].motion, ...config.motion };
}

/**
 * Resolve a decoupled appearance mix into concrete tokens, chrome, signal,
 * motion, deck, welcome, and glyph layers.
 */
export function resolveAppearanceMix(
  config: AppearanceMixConfig = {},
): ResolvedAppearance {
  const baseName = config.base ?? "lanternwake";
  const base = getStructuralPreset(baseName);

  const paletteName = layerPreset(config, "palette", baseName);
  const signalName = layerPreset(config, "signalLayout", baseName);
  const chromeName = layerPreset(config, "chrome", baseName);
  const glyphName = layerPreset(config, "glyphs", baseName);
  const deckName = layerPreset(config, "deck", baseName);
  const welcomeName = layerPreset(config, "welcome", baseName);

  const palette = getStructuralPreset(paletteName);
  const signalPreset = getStructuralPreset(signalName);

  return {
    base: baseName,
    tokens: resolveTokens(palette.tokens),
    chrome: cloneChrome(getStructuralPreset(chromeName).chrome),
    signal: cloneSignal(signalPreset.signal),
    motion: resolveMotionLayer(config, baseName),
    deck: cloneDeck(getStructuralPreset(deckName).deck),
    welcome: cloneWelcome(getStructuralPreset(welcomeName).welcome),
    glyphs: cloneGlyphs(getStructuralPreset(glyphName).glyphs),
  };
}

/** Pick the model ornament for the active glyph mode. */
export function resolveGlyphOrnament(
  glyphs: GlyphSet,
  useNerd: boolean,
  role: "model" | "segment" = "model",
): string {
  if (role === "model") {
    if (useNerd) return glyphs.model ?? "";
    return glyphs.modelAscii ?? glyphs.model ?? "";
  }
  if (useNerd) return glyphs.segment ?? "";
  return glyphs.segmentAscii ?? glyphs.segment ?? "";
}

/** Whether glyphs should use Nerd ornaments for this set. */
export function glyphsPreferNerd(glyphs: GlyphSet, nerdAvailable: boolean): boolean {
  switch (glyphs.mode) {
    case "nerd":
      return true;
    case "ascii":
      return false;
    case "auto":
      return nerdAvailable;
  }
}

/** Validate that every motion ref in a resolved appearance exists in the catalog. */
export function validateAppearanceMotions(
  appearance: ResolvedAppearance,
): { ok: true } | { ok: false; missing: string[] } {
  const missing: string[] = [];
  for (const [event, ref] of Object.entries(appearance.motion) as Array<
    [MotionEvent, MotionRef | undefined]
  >) {
    if (ref && !getMotion(ref)) {
      missing.push(`${event}:${ref}`);
    }
  }
  if (appearance.welcome.motionId && !getMotion(appearance.welcome.motionId)) {
    missing.push(`welcome:${appearance.welcome.motionId}`);
  }
  if (!getMotion(appearance.signal.animation)) {
    missing.push(`signal:${appearance.signal.animation}`);
  }
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

function cloneChrome(chrome: ChromeSpec): ChromeSpec {
  return {
    ...chrome,
    corners: { ...chrome.corners },
    dividers: { ...chrome.dividers },
  };
}

function cloneSignal(signal: SignalSpec): SignalSpec {
  return {
    ...signal,
    separators: { ...signal.separators },
    caps: { ...signal.caps },
  };
}

function cloneDeck(deck: DeckSpec): DeckSpec {
  return { ...deck };
}

function cloneWelcome(welcome: WelcomeSpec): WelcomeSpec {
  return { ...welcome };
}

function cloneGlyphs(glyphs: GlyphSet): GlyphSet {
  return { ...glyphs };
}

/** Merge structural personality fields onto a layout preset without mutating it. */
export function withStructuralPersonality(
  preset: import("./types.ts").PresetDef,
  structural: StructuralPresetName,
): import("./types.ts").PresetDef {
  const personality = getStructuralPreset(structural);
  return {
    ...preset,
    tokens: personality.tokens,
    chrome: personality.chrome,
    signal: personality.signal,
    motion: personality.motion,
    deck: personality.deck,
    welcome: personality.welcome,
    glyphs: personality.glyphs,
  };
}

export type { WishcraftTokens };
