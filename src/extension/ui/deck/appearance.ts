/**
 * Appearance route: panes, fuzzy search, live mix patches, gallery listing.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import {
  STRUCTURAL_PRESET_NAMES,
  type AppearanceMixConfig,
  type StructuralPresetName,
} from "../../../config/types.ts";
import { getStructuralPreset } from "../../../config/structural-presets.ts";
import { MOTION_CATALOG } from "../../../motion/catalog.ts";
import { searchMotions, previewMotionRail } from "../../../motion/gallery.ts";
import { composerTimeline, draftFromId } from "../../../motion/composer.ts";
import {
  describeMotionLevel,
  isMotionLevel,
} from "../../../motion/accessibility.ts";
import type { MotionLevel } from "../../../motion/types.ts";
import { PRESETS } from "../../../config/presets.ts";
import type { AppearancePane, DeckAppearanceState } from "./types.ts";
import { APPEARANCE_PANES } from "./types.ts";

export interface AppearanceSearchHit {
  id: string;
  label: string;
  group: string;
  keywords: string;
  kind: "preset" | "palette" | "motion" | "level" | "layout" | "glyphs" | "setting";
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
        motion: { ...(typeof current.motion === "object" ? current.motion : {}), streaming: hit.value },
      };
    case "glyphs":
      return {
        ...current,
        glyphs: hit.value === "ascii" ? "vellum" : "hexforge",
      };
    default:
      return current;
  }
}

export function applyAppearanceSelection(
  current: AppearanceMixConfig,
  pane: AppearancePane,
  value: string,
): AppearanceMixConfig {
  if (pane === "presets" && isStructural(value)) return { ...current, base: value };
  if (pane === "palette" && isStructural(value)) return { ...current, palette: value };
  if (pane === "signal" && isStructural(value)) return { ...current, signalLayout: value };
  if (pane === "glyphs" && isStructural(value)) return { ...current, glyphs: value };
  if (pane === "motion") {
    return {
      ...current,
      motion: { ...(typeof current.motion === "object" ? current.motion : {}), streaming: value },
    };
  }
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
      return LAYOUT_PRESETS;
    case "accessibility":
      return [...LEVELS];
  }
}

export function nextAppearancePane(pane: AppearancePane, direction = 1): AppearancePane {
  const index = APPEARANCE_PANES.indexOf(pane);
  return APPEARANCE_PANES[(index + direction + APPEARANCE_PANES.length) % APPEARANCE_PANES.length]!;
}

export function renderAppearanceBody(
  theme: Theme,
  width: number,
  appearance: DeckAppearanceState,
  mix: AppearanceMixConfig,
): string[] {
  const options = paneOptions(appearance.pane);
  const selected = options[appearance.selected] ?? options[0] ?? "";
  const lines = [
    theme.fg("accent", `APPEARANCE / ${appearance.pane.toUpperCase()}`),
    `Base ${mix.base ?? "lanternwake"} · palette ${mix.palette ?? mix.base ?? "lanternwake"}`,
    options
      .slice(0, 6)
      .map((option, index) => (index === appearance.selected ? `▶ ${option}` : `  ${option}`))
      .join("   "),
    "",
  ];

  if (appearance.pane === "motion" || appearance.composerOpen) {
    const draft = draftFromId(selected);
    const queryHits = appearance.query ? searchMotions(appearance.query) : [];
    lines.push(`Preview ${selected}`);
    lines.push(previewMotionRail(MOTION_CATALOG.find((m) => m.id === selected) ?? MOTION_CATALOG[0]!, appearance.previewTick, Math.min(24, width), false));
    if (draft) lines.push(composerTimeline(draft, 4));
    if (queryHits.length) {
      lines.push(`Search ${queryHits.length} motions`);
    }
  }

  if (appearance.pane === "accessibility") {
    const level = isMotionLevel(selected) ? selected : "full";
    lines.push(describeMotionLevel(level));
    lines.push("NO_COLOR strips ANSI · screen reader uses stable text");
  }

  lines.push("tab pane · enter apply · e composer · / search");
  return lines.map((line) => truncateToWidth(line, width, "…", true));
}

export function renderMotionGalleryBody(
  theme: Theme,
  width: number,
  appearance: DeckAppearanceState,
): string[] {
  const hits = searchMotions(appearance.query);
  const lines = [
    theme.fg("accent", "MOTION GALLERY"),
    `Catalog ${MOTION_CATALOG.length} · showing ${hits.length}`,
    hits
      .slice(0, 8)
      .map((motion, index) => (index === appearance.selected ? `▶ ${motion.name}` : `  ${motion.name}`))
      .join("  "),
  ];
  const selected = hits[appearance.selected] ?? hits[0];
  if (selected) {
    lines.push(previewMotionRail(selected, appearance.previewTick, Math.min(28, width)));
    lines.push(selected.description);
  }
  lines.push("space play · e composer · f favorite");
  return lines.map((line) => truncateToWidth(line, width, "…", true));
}
