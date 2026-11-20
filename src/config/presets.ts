/**
 * presets.ts
 * ---------------------------------------------------------------------------
 * Preset resolution: built-ins live in preset-table.ts; user-defined presets
 * from settings merge over them at config time.
 * ---------------------------------------------------------------------------
 */

import type { PresetDef, StatusLinePreset } from "./types.ts";
import type { CustomPresetConfig } from "./types.ts";
import { PRESETS } from "./preset-table.ts";

export { PRESETS };

export function getPreset(name: string): PresetDef {
  return resolvePreset(name);
}

// User-defined presets (settings), merged over built-ins at config time.
const customPresets = new Map<string, PresetDef>();

/** Register user-defined presets from settings. Replaces any previously registered. */
export function registerCustomPresets(
  defs: Record<string, CustomPresetConfig>,
): void {
  customPresets.clear();
  for (const [name, def] of Object.entries(defs)) {
    const presetDef: PresetDef = {
      leftSegments: def.left ?? [],
      rightSegments: def.right ?? [],
      secondarySegments: def.secondary,
      separator: def.separator ?? "slash",
      segmentOptions: def.segmentOptions,
      colors: def.colors,
      tokens: def.tokens,
    };
    customPresets.set(name, presetDef);
  }
}

// Warn once per unknown preset name instead of silently falling back to default.
const warnedUnknownPresets = new Set<string>();

/** Resolve a preset by name, checking user-defined presets first. */
export function resolvePreset(name: string): PresetDef {
  if (
    customPresets.has(name) ||
    Object.prototype.hasOwnProperty.call(PRESETS, name)
  ) {
    return (
      customPresets.get(name) ??
      (PRESETS[name as StatusLinePreset] ?? PRESETS.default)
    );
  }
  if (!warnedUnknownPresets.has(name)) {
    warnedUnknownPresets.add(name);
    console.warn(
      `[wishcraft] Unknown powerline preset "${name}" — falling back to "default".`,
    );
  }
  return PRESETS.default;
}
