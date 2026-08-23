/**
 * appearance-write.ts
 * ---------------------------------------------------------------------------
 * Persist `powerline.appearance.base` and refresh the live Signal.
 * ---------------------------------------------------------------------------
 */

import type { StructuralPresetName } from "../../config/types.ts";
import type { MotionEvent } from "../../motion/types.ts";
import { isStructuralPresetName } from "../../config/structural-presets.ts";
import {
  effectiveAppearanceMix,
  resolveAppearanceMix,
} from "../../config/appearance.ts";
import {
  isMotionLevel,
  policyFromEnvironment,
  type MotionLevel,
} from "../../motion/accessibility.ts";
import { parsePowerlineConfig } from "../../config/powerline-config.ts";
import { isRecord, writePowerlineSetting } from "./settings-io.ts";
import { config, PRESET_NAMES, setConfig } from "../core/state.ts";
import {
  requestImmediateStatusRender,
  resetLayoutCache,
} from "../core/segment-context.ts";
import type { RuntimeState } from "../core/types.ts";

export function writeAppearanceBase(
  cwd: string,
  name: StructuralPresetName,
): boolean {
  return writePowerlineSetting(cwd, (existing) => {
    const node: Record<string, unknown> = isRecord(existing)
      ? { ...existing }
      : typeof existing === "string"
        ? { preset: existing }
        : {};
    const appearance = isRecord(node.appearance) ? { ...node.appearance } : {};
    appearance.base = name;
    node.appearance = appearance;
    return node;
  });
}

/** Write the structural base, keep session config in sync, and repaint Signal. */
export function applyAppearanceBase(
  rt: RuntimeState,
  cwd: string,
  name: StructuralPresetName,
): boolean {
  config.appearance = { ...config.appearance, base: name };
  const ok = writeAppearanceBase(cwd, name);
  resetLayoutCache(rt);
  requestImmediateStatusRender(rt);
  return ok;
}

/** `/signal hexforge` also sets appearance.base so colors match the layout name. */
export function syncAppearanceForLayoutPreset(
  rt: RuntimeState,
  cwd: string,
  preset: string,
): void {
  if (!isStructuralPresetName(preset)) return;
  applyAppearanceBase(rt, cwd, preset);
}

export function applyPersistedMotionPolicy(rt: RuntimeState): void {
  rt.motionPolicy = policyFromEnvironment(process.env, config.motionLevel);
}

/** Re-parse `settings.powerline` into session config and repaint Signal. */
export function reloadPowerlineFromSettings(
  rt: RuntimeState,
  settings: Record<string, unknown>,
): void {
  setConfig({
    ...config,
    ...parsePowerlineConfig(settings.powerline, PRESET_NAMES),
  });
  applyPersistedMotionPolicy(rt);
  resetLayoutCache(rt);
  requestImmediateStatusRender(rt);
}

export function applyMotionLevel(
  rt: RuntimeState,
  cwd: string,
  level: MotionLevel,
): boolean {
  if (!isMotionLevel(level)) return false;
  config.motionLevel = level;
  applyPersistedMotionPolicy(rt);
  const ok = writePowerlineSetting(cwd, (existing) => {
    const node: Record<string, unknown> = isRecord(existing)
      ? { ...existing }
      : typeof existing === "string"
        ? { preset: existing }
        : {};
    node.motionLevel = level;
    return node;
  });
  resetLayoutCache(rt);
  requestImmediateStatusRender(rt);
  return ok;
}

export function applyMotionAssignment(
  rt: RuntimeState,
  cwd: string,
  event: MotionEvent,
  motionId: string,
): boolean {
  const current = {
    ...resolveAppearanceMix(effectiveAppearanceMix(config.appearance, config.preset))
      .motion,
    [event]: motionId,
  };
  config.appearance = { ...config.appearance, motion: current };
  const ok = writePowerlineSetting(cwd, (existing) => {
    const node: Record<string, unknown> = isRecord(existing)
      ? { ...existing }
      : typeof existing === "string"
        ? { preset: existing }
        : {};
    const appearance = isRecord(node.appearance) ? { ...node.appearance } : {};
    appearance.motion = current;
    node.appearance = appearance;
    return node;
  });
  resetLayoutCache(rt);
  requestImmediateStatusRender(rt);
  return ok;
}
