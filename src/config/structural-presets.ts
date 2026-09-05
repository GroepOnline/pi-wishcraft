/**
 * structural-presets.ts
 * ---------------------------------------------------------------------------
 * Public API for the structural presets: lookup, effective-resolution with
 * appearance contributions, display names, and motion-map completion.
 * Definitions live in structural-preset-table.ts; shared helpers and
 * chrome/deck/welcome constants in structural-preset-data.ts.
 * ---------------------------------------------------------------------------
 */

import type { MotionRef, StructuralPresetDef, StructuralPresetName } from "./types.ts";
import type { MotionEvent } from "../motion/types.ts";
import { STRUCTURAL_PRESET_NAMES } from "./types.ts";

import { defaultMotionFor } from "../motion/catalog.ts";
import { resolveAppearance } from "../extension/contrib/appearance.ts";
import { STRUCTURAL_PRESETS } from "./structural-preset-table.ts";

export { STRUCTURAL_PRESET_NAMES };
export { STRUCTURAL_PRESETS };

export function isStructuralPresetName(name: string): name is StructuralPresetName {
  return (STRUCTURAL_PRESET_NAMES as readonly string[]).includes(name);
}

export function getStructuralPreset(name: StructuralPresetName): StructuralPresetDef {
  return resolveAppearance(STRUCTURAL_PRESETS[name]);
}

export function getEffectivePreset(name: StructuralPresetName): StructuralPresetDef {
  return getStructuralPreset(name);
}

/** Display name for a stored base, or the raw value when it is not structural. */
export function appearanceDisplayName(name: string): string {
  return isStructuralPresetName(name) ? getStructuralPreset(name).displayName : name;
}

/** Signature motion id for a structural preset (streaming / thinking lane). */
export function signatureMotionFor(name: StructuralPresetName): MotionRef {
  return STRUCTURAL_PRESETS[name].signal.animation;
}

/** Fill missing motion events with catalog defaults. */
export function completeMotionMap(
  partial: Partial<Record<MotionEvent, MotionRef>>,
): Partial<Record<MotionEvent, MotionRef>> {
  const complete: Partial<Record<MotionEvent, MotionRef>> = { ...partial };
  const events: MotionEvent[] = [
    "idle",
    "thinking",
    "streaming",
    "tool.start",
    "tool.end",
    "idea.capture",
    "skill.insert",
    "policy.deny",
    "repair",
    "compact",
    "success",
    "warning",
    "error",
  ];
  for (const event of events) {
    if (complete[event] === undefined) {
      complete[event] = defaultMotionFor(event);
    }
  }
  return complete;
}
