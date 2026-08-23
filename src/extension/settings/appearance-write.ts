/**
 * appearance-write.ts
 * ---------------------------------------------------------------------------
 * Persist `powerline.appearance.base` and refresh the live Signal.
 * ---------------------------------------------------------------------------
 */

import type { StructuralPresetName } from "../../config/types.ts";
import { isStructuralPresetName } from "../../config/structural-presets.ts";
import { isRecord, writePowerlineSetting } from "./settings-io.ts";
import { config } from "../core/state.ts";
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
