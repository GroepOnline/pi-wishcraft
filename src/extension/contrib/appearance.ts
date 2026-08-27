import type { StructuralPresetDef, StructuralPresetName } from "../../config/types.ts";

// ponytail: appearance contributions are data patches, not loaders. One preset may have many patches; last wins per field.

type SignalPatch = Omit<Partial<StructuralPresetDef["signal"]>, "separators" | "caps"> & {
  separators?: Partial<StructuralPresetDef["signal"]["separators"]>;
  caps?: Partial<StructuralPresetDef["signal"]["caps"]>;
};

type ChromePatch = Omit<Partial<StructuralPresetDef["chrome"]>, "corners" | "dividers"> & {
  corners?: Partial<StructuralPresetDef["chrome"]["corners"]>;
  dividers?: Partial<StructuralPresetDef["chrome"]["dividers"]>;
};

export type AppearancePresetPatch = Omit<
  Partial<StructuralPresetDef>,
  "name" | "tokens" | "signal" | "chrome" | "glyphs"
> & {
  tokens?: StructuralPresetDef["tokens"];
  signal?: SignalPatch;
  chrome?: ChromePatch;
  glyphs?: Partial<StructuralPresetDef["glyphs"]>;
};

const patches = new Map<StructuralPresetName, AppearancePresetPatch[]>();

/** Register an appearance-only patch for a structural preset. Invalid input is rejected without throwing. */
export function registerAppearanceContribution(
  preset: StructuralPresetName,
  patch: AppearancePresetPatch,
): boolean {
  if (!preset || typeof patch !== "object" || patch === null) return false;
  if (Array.isArray(patch) || "name" in patch) return false;
  const list = patches.get(preset) ?? [];
  list.push({ ...patch });
  patches.set(preset, list);
  return true;
}

/** Return registered patches for a preset in application order. */
export function getAppearancePatches(
  preset: StructuralPresetName,
): readonly AppearancePresetPatch[] {
  return patches.get(preset) ?? [];
}

/** Clear all registered appearance contributions. Primarily used for isolation in tests and reloads. */
export function clearAppearanceContributions(): void {
  patches.clear();
}

/** Resolve a structural preset with all contributed patches while preserving nested defaults and preset identity. */
export function resolveAppearance(base: StructuralPresetDef): StructuralPresetDef {
  const list = patches.get(base.name as StructuralPresetName);
  if (!list || list.length === 0) return base;
  let out: StructuralPresetDef = { ...base };
  for (const patch of list) {
    out = {
      ...out,
      ...patch,
      name: base.name,
      tokens: patch.tokens ? { ...out.tokens, ...patch.tokens } : out.tokens,
      signal: patch.signal
        ? {
            ...out.signal,
            ...patch.signal,
            separators: patch.signal.separators
              ? { ...out.signal.separators, ...patch.signal.separators }
              : out.signal.separators,
            caps: patch.signal.caps
              ? { ...out.signal.caps, ...patch.signal.caps }
              : out.signal.caps,
          }
        : out.signal,
      chrome: patch.chrome
        ? {
            ...out.chrome,
            ...patch.chrome,
            corners: patch.chrome.corners
              ? { ...out.chrome.corners, ...patch.chrome.corners }
              : out.chrome.corners,
            dividers: patch.chrome.dividers
              ? { ...out.chrome.dividers, ...patch.chrome.dividers }
              : out.chrome.dividers,
          }
        : out.chrome,
      glyphs: patch.glyphs ? { ...out.glyphs, ...patch.glyphs } : out.glyphs,
    };
  }
  return out;
}
