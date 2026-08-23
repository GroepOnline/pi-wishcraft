/**
 * Motion gallery: search, grouping, favorites, and preview rails.
 */

import { MOTION_CATALOG } from "./catalog.ts";
import { frameAt } from "./frames.ts";
import { renderRailSweep } from "../signal/rail.ts";
import type { MotionDef } from "./types.ts";

export const GALLERY_GROUPS = [
  "wishcraft",
  "matrix",
  "procedural",
  "classic",
  "favorites",
  "custom",
] as const;

export type GalleryGroup = (typeof GALLERY_GROUPS)[number];

export function searchMotions(
  query: string,
  catalog: readonly MotionDef[] = MOTION_CATALOG,
): MotionDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...catalog];
  return catalog.filter((motion) => {
    const hay = `${motion.id} ${motion.name} ${motion.category} ${motion.description} ${motion.fallbackGlyph}`.toLowerCase();
    return hay.includes(q);
  });
}

export function toggleFavorite(favorites: readonly string[], id: string): string[] {
  return favorites.includes(id)
    ? favorites.filter((item) => item !== id)
    : [...favorites, id];
}

export function groupMotions(
  favorites: readonly string[] = [],
  catalog: readonly MotionDef[] = MOTION_CATALOG,
): Record<GalleryGroup, MotionDef[]> {
  const groups: Record<GalleryGroup, MotionDef[]> = {
    wishcraft: [],
    matrix: [],
    procedural: [],
    classic: [],
    favorites: [],
    custom: [],
  };
  for (const motion of catalog) {
    if (motion.category === "custom") groups.custom.push(motion);
    else if (motion.category === "wishcraft") groups.wishcraft.push(motion);
    else if (motion.category === "matrix") groups.matrix.push(motion);
    else if (motion.category === "procedural") groups.procedural.push(motion);
    else groups.classic.push(motion);
    if (favorites.includes(motion.id)) groups.favorites.push(motion);
  }
  return groups;
}

export function previewMotionFrames(def: MotionDef, ticks = 4, ascii = false): string[] {
  return Array.from({ length: ticks }, (_, tick) => frameAt(def, tick, ascii));
}

export function previewMotionRail(
  def: MotionDef,
  tick: number,
  width = 16,
  ascii = false,
): string {
  const animating = def.loop !== "finite" || tick > 0;
  return renderRailSweep({
    tick,
    width,
    animating,
    ascii,
    trail: def.generator?.trail ?? 3,
    direction: def.generator?.direction ?? "forward",
  });
}

export function motionsInGroup(
  group: GalleryGroup,
  favorites: readonly string[] = [],
  catalog: readonly MotionDef[] = MOTION_CATALOG,
): MotionDef[] {
  return groupMotions(favorites, catalog)[group];
}
