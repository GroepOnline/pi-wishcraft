/**
 * structural-presets.ts
 * ---------------------------------------------------------------------------
 * Ten signature structural presets for Wishcraft vNext. Each preset is a full
 * design system: tokens, chrome, signal grammar, motion refs, deck chrome,
 * welcome screen, and glyph pairs (Nerd + ASCII).
 * ---------------------------------------------------------------------------
 */

import type {
  StructuralPresetDef,
  StructuralPresetName,
} from "./types.ts";
import { STRUCTURAL_PRESET_NAMES } from "./types.ts";

export { STRUCTURAL_PRESET_NAMES };
import type { MotionEvent } from "../motion/types.ts";
import type { MotionRef } from "./types.ts";
import { defaultMotionFor } from "../motion/catalog.ts";
import { STRUCTURAL_PRESETS } from "./structural-preset-table.ts";

export { STRUCTURAL_PRESETS };

export function isStructuralPresetName(name: string): name is StructuralPresetName {
  return (STRUCTURAL_PRESET_NAMES as readonly string[]).includes(name);
}

export function getStructuralPreset(name: StructuralPresetName): StructuralPresetDef {
  return STRUCTURAL_PRESETS[name];
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
