/**
 * Motion Composer — tweak a draft, preview it, and turn it into a MotionDef.
 * Assignment of the draft to a semantic event is a separate persist step.
 */

import { previewStrip } from "./gallery.ts";
import type {
  MotionChannel,
  MotionColorRole,
  MotionDef,
  MotionEvent,
  MotionGenerator,
  MotionGeometry,
} from "./types.ts";

export type MotionEase = MotionGenerator["ease"];

export interface ComposerDraft {
  id: string;
  name: string;
  geometry: MotionGeometry;
  intervalMs: number;
  trail: number;
  direction: "forward" | "reverse";
  ease: MotionEase;
  fallbackGlyph: string;
  colorRole: MotionColorRole;
  channels: MotionChannel[];
  assignEvent: MotionEvent;
}

export const COMPOSER_FIELDS = [
  "geometry",
  "intervalMs",
  "trail",
  "direction",
  "ease",
  "assignEvent",
] as const;

export type ComposerField = (typeof COMPOSER_FIELDS)[number];

export const COMPOSER_GEOMETRIES: MotionGeometry[] = [
  "linear",
  "orbit",
  "wave",
  "bloom",
  "liquid",
  "ember",
  "stitch",
  "refract",
  "heat",
  "write",
  "path",
];

export const COMPOSER_EVENTS: MotionEvent[] = [
  "thinking",
  "streaming",
  "tool.start",
  "idle",
  "success",
  "compact",
];

export const COMPOSER_EASES: MotionEase[] = ["linear", "pulse", "breathe"];

export function draftFromMotion(
  def: MotionDef,
  assignEvent: MotionEvent = "streaming",
): ComposerDraft {
  return {
    id: def.id,
    name: def.name,
    geometry: def.generator?.geometry ?? "linear",
    intervalMs: def.generator?.intervalMs ?? 100,
    trail: def.generator?.trail ?? 2,
    direction: def.generator?.direction ?? "forward",
    ease: def.generator?.ease ?? "linear",
    fallbackGlyph: def.fallbackGlyph,
    colorRole: def.colorRole,
    channels: [...def.channels],
    assignEvent,
  };
}

export function motionFromDraft(draft: ComposerDraft): MotionDef {
  return {
    id: draft.id,
    name: draft.name,
    category: "custom",
    kind: "generator",
    channels: draft.channels,
    colorRole: draft.colorRole,
    fallbackGlyph: draft.fallbackGlyph,
    loop: draft.assignEvent === "idle" ? "ambient" : "while-active",
    generator: {
      geometry: draft.geometry,
      intervalMs: draft.intervalMs,
      trail: draft.trail,
      direction: draft.direction,
      ease: draft.ease,
    },
    description: `Composer draft of ${draft.name} for ${draft.assignEvent}.`,
  };
}

export function nudgeComposer(
  draft: ComposerDraft,
  field: ComposerField,
  delta: number,
): ComposerDraft {
  const next = { ...draft };
  if (field === "intervalMs") {
    next.intervalMs = clamp(draft.intervalMs + delta * 10, 40, 400);
  } else if (field === "trail") {
    next.trail = clamp(draft.trail + delta, 0, 8);
  } else if (field === "direction") {
    next.direction = draft.direction === "forward" ? "reverse" : "forward";
  } else if (field === "geometry") {
    next.geometry = cycle(COMPOSER_GEOMETRIES, draft.geometry, delta);
  } else if (field === "ease") {
    next.ease = cycle(COMPOSER_EASES, draft.ease, delta);
  } else if (field === "assignEvent") {
    next.assignEvent = cycle(COMPOSER_EVENTS, draft.assignEvent, delta);
  }
  return next;
}

export function composerPreview(draft: ComposerDraft, tick: number, width: number): string {
  return previewStrip(motionFromDraft(draft), tick, width);
}

export function cycleAssignEvent(event: MotionEvent, delta = 1): MotionEvent {
  return cycle(COMPOSER_EVENTS, event, delta);
}

function cycle<T>(list: readonly T[], current: T, delta: number): T {
  const idx = list.indexOf(current);
  const start = idx >= 0 ? idx : 0;
  const next = (start + delta + list.length * 8) % list.length;
  return list[next]!;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
