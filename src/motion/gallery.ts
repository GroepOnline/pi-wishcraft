/**
 * Motion Gallery — pure catalog queries and preview strips.
 * The Deck and the preview server both read this; nothing here touches ctx.ui.
 */

import { MOTION_CATALOG } from "./catalog.ts";
import { frameAt, framesOf, sweepPosition, trailGlyph } from "./frames.ts";
import type { MotionDef } from "./types.ts";

export const GALLERY_CATEGORIES = [
  "wishcraft",
  "matrix",
  "procedural",
  "classic",
  "custom",
] as const;

export type GalleryCategory = (typeof GALLERY_CATEGORIES)[number];

export function motionMatchesQuery(def: MotionDef, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = `${def.id} ${def.name} ${def.category} ${def.description} ${def.kind}`.toLowerCase();
  return hay.includes(q);
}

export function filterMotions(
  query: string,
  catalog: readonly MotionDef[] = MOTION_CATALOG,
): MotionDef[] {
  return catalog.filter((def) => motionMatchesQuery(def, query));
}

export function groupMotions(
  motions: readonly MotionDef[],
): Record<GalleryCategory, MotionDef[]> {
  const groups: Record<GalleryCategory, MotionDef[]> = {
    wishcraft: [],
    matrix: [],
    procedural: [],
    classic: [],
    custom: [],
  };
  for (const def of motions) {
    groups[def.category].push(def);
  }
  return groups;
}

/** Travelling-head preview used by the gallery and composer. */
export function previewStrip(
  def: MotionDef,
  tick: number,
  width: number,
  ascii = false,
): string {
  const inner = Math.max(8, width);
  const head = frameAt(def, tick, ascii);
  const direction = def.generator?.direction ?? "forward";
  const pos = sweepPosition(tick, inner, true, direction);
  let out = "";
  for (let i = 0; i < inner; i++) {
    const distance = Math.abs(i - pos);
    if (distance === 0) out += head;
    else if (distance <= (def.generator?.trail ?? 2)) out += trailGlyph(distance, ascii);
    else out += ascii ? "-" : "─";
  }
  return out;
}

export function motionIntervalMs(def: MotionDef): number {
  return def.generator?.intervalMs ?? 100;
}

export function motionFrameCount(def: MotionDef): number {
  return framesOf(def).length;
}
