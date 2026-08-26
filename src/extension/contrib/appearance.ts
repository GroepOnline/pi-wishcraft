import type { StructuralPresetDef, StructuralPresetName } from "../../config/types.ts";

// ponytail: appearance contributions are data patches, not loaders. One preset may have many patches; last wins per field.

type PresetPatch = Partial<StructuralPresetDef>;

const patches = new Map<StructuralPresetName, PresetPatch[]>();

export function registerAppearanceContribution(
  preset: StructuralPresetName,
  patch: PresetPatch,
): boolean {
  if (!preset || typeof patch !== "object" || patch === null) return false;
  if (Array.isArray(patch)) return false;
  const list = patches.get(preset) ?? [];
  list.push({ ...patch });
  patches.set(preset, list);
  return true;
}

export function getAppearancePatches(preset: StructuralPresetName): readonly PresetPatch[] {
  return patches.get(preset) ?? [];
}

export function clearAppearanceContributions(): void {
  patches.clear();
}

export function resolveAppearance(
  base: StructuralPresetDef,
): StructuralPresetDef {
  const list = patches.get(base.name as StructuralPresetName);
  if (!list || list.length === 0) return base;
  let out: StructuralPresetDef = { ...base };
  for (const patch of list) {
    // ponytail: shallow merge per top-level key; tokens merged deeply once
    out = {
      ...out,
      ...patch,
      tokens: patch.tokens ? { ...out.tokens, ...patch.tokens } : out.tokens,
      signal: patch.signal ? { ...out.signal, ...patch.signal } : out.signal,
      chrome: patch.chrome ? { ...out.chrome, ...patch.chrome } : out.chrome,
      glyphs: patch.glyphs ? { ...out.glyphs, ...patch.glyphs } : out.glyphs,
    };
  }
  return out;
}
