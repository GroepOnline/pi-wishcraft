/**
 * Search-first appearance catalog recovered from the vNext operator draft.
 * The Deck appearance route filters this catalog; preset, motion, and level
 * hits persist through the existing appearance writers.
 */

import { PRESETS } from "../../../config/presets.ts";
import { getStructuralPreset } from "../../../config/structural-presets.ts";
import {
  STRUCTURAL_PRESET_NAMES,
  type AppearanceMixConfig,
  type StructuralPresetName,
} from "../../../config/types.ts";
import { describeMotionLevel, isMotionLevel } from "../../../motion/accessibility.ts";
import { MOTION_CATALOG } from "../../../motion/catalog.ts";
import type { MotionLevel } from "../../../motion/types.ts";

export const APPEARANCE_PANES = [
  "presets",
  "palette",
  "signal",
  "glyphs",
  "motion",
  "layout",
  "accessibility",
] as const;

export type AppearancePane = (typeof APPEARANCE_PANES)[number];

export type AppearanceHitKind =
  | "preset"
  | "palette"
  | "motion"
  | "level"
  | "layout"
  | "glyphs"
  | "setting";

export interface AppearanceSearchHit {
  id: string;
  label: string;
  group: string;
  keywords: string;
  kind: AppearanceHitKind;
  value: string;
}

const LAYOUT_PRESETS = Object.keys(PRESETS);
const LEVELS: MotionLevel[] = ["full", "reduced", "functional", "off"];

export function appearanceCatalog(): AppearanceSearchHit[] {
  const hits: AppearanceSearchHit[] = [];
  for (const name of STRUCTURAL_PRESET_NAMES) {
    const preset = getStructuralPreset(name);
    hits.push({
      id: `base:${name}`,
      label: `${preset.displayName} base`,
      group: "Presets",
      keywords: `${name} ${preset.displayName} ${preset.description} preset`,
      kind: "preset",
      value: name,
    });
    hits.push({
      id: `palette:${name}`,
      label: `${preset.displayName} palette`,
      group: "Palette",
      keywords: `${name} palette tokens colors`,
      kind: "palette",
      value: name,
    });
  }
  for (const motion of MOTION_CATALOG) {
    hits.push({
      id: `motion:${motion.id}`,
      label: motion.name,
      group: "Motion",
      keywords: `${motion.id} ${motion.name} ${motion.category} ${motion.description}`,
      kind: "motion",
      value: motion.id,
    });
  }
  for (const level of LEVELS) {
    hits.push({
      id: `level:${level}`,
      label: `Motion ${level}`,
      group: "Accessibility",
      keywords: `motion level ${level} ${describeMotionLevel(level)} accessibility`,
      kind: "level",
      value: level,
    });
  }
  for (const name of LAYOUT_PRESETS) {
    hits.push({
      id: `layout:${name}`,
      label: `Layout ${name}`,
      group: "Layout",
      keywords: `layout preset ${name}`,
      kind: "layout",
      value: name,
    });
  }
  hits.push(
    {
      id: "glyphs:ascii",
      label: "ASCII glyphs",
      group: "Glyphs",
      keywords: "glyphs ascii fallback",
      kind: "glyphs",
      value: "ascii",
    },
    {
      id: "glyphs:nerd",
      label: "Nerd glyphs",
      group: "Glyphs",
      keywords: "glyphs nerd font",
      kind: "glyphs",
      value: "nerd",
    },
    {
      id: "setting:no-color",
      label: "Respect NO_COLOR",
      group: "Accessibility",
      keywords: "no_color no color ansi",
      kind: "setting",
      value: "noColor",
    },
  );
  return hits;
}

export function searchAppearanceConfig(query: string): AppearanceSearchHit[] {
  const q = query.trim().toLowerCase();
  const catalog = appearanceCatalog();
  if (!q) return catalog;
  return catalog.filter((hit) => {
    const hay = `${hit.label} ${hit.group} ${hit.keywords} ${hit.value}`.toLowerCase();
    return hay.includes(q);
  });
}

export function applyAppearanceHit(
  current: AppearanceMixConfig,
  hit: AppearanceSearchHit,
): AppearanceMixConfig {
  switch (hit.kind) {
    case "preset":
      return { ...current, base: hit.value as StructuralPresetName };
    case "palette":
      return { ...current, palette: hit.value as StructuralPresetName };
    case "motion":
      return {
        ...current,
        motion: {
          ...(typeof current.motion === "object" ? current.motion : {}),
          streaming: hit.value,
        },
      };
    case "glyphs":
      return {
        ...current,
        glyphs: hit.value === "ascii" ? "vellum" : "hexforge",
      };
    case "level":
    case "layout":
    case "setting":
      return current;
    default: {
      const exhaustive: never = hit.kind;
      return exhaustive;
    }
  }
}

export function applyAppearanceSelection(
  current: AppearanceMixConfig,
  pane: AppearancePane,
  value: string,
): AppearanceMixConfig {
  if ((pane === "presets" || pane === "palette" || pane === "signal" || pane === "glyphs") && isStructural(value)) {
    if (pane === "presets") return { ...current, base: value };
    if (pane === "palette") return { ...current, palette: value };
    if (pane === "signal") return { ...current, signalLayout: value };
    return { ...current, glyphs: value };
  }
  if (pane === "motion") {
    return {
      ...current,
      motion: {
        ...(typeof current.motion === "object" ? current.motion : {}),
        streaming: value,
      },
    };
  }
  if (pane === "accessibility" && isMotionLevel(value)) return current;
  if (pane === "layout") return current;
  return current;
}

function isStructural(value: string): value is StructuralPresetName {
  return (STRUCTURAL_PRESET_NAMES as readonly string[]).includes(value);
}

export function paneOptions(pane: AppearancePane): string[] {
  switch (pane) {
    case "presets":
    case "palette":
    case "signal":
    case "glyphs":
      return [...STRUCTURAL_PRESET_NAMES];
    case "motion":
      return MOTION_CATALOG.map((motion) => motion.id);
    case "layout":
      return [...LAYOUT_PRESETS];
    case "accessibility":
      return [...LEVELS];
    default: {
      const exhaustive: never = pane;
      return exhaustive;
    }
  }
}

export function nextAppearancePane(pane: AppearancePane, direction = 1): AppearancePane {
  const index = APPEARANCE_PANES.indexOf(pane);
  const next = (index + direction + APPEARANCE_PANES.length) % APPEARANCE_PANES.length;
  return APPEARANCE_PANES[next] ?? "presets";
}
