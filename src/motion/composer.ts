/**
 * Motion composer: tweak generator parameters and preview frames without a TUI.
 */

import { frameAt, framesOf } from "./frames.ts";
import { getMotion } from "./catalog.ts";
import type {
  MotionChannel,
  MotionDef,
  MotionGeometry,
  MotionGenerator,
} from "./types.ts";

export interface ComposerDraft {
  id: string;
  name: string;
  geometry: MotionGeometry;
  intervalMs: number;
  trail: number;
  direction: "forward" | "reverse";
  ease: "linear" | "pulse" | "breathe";
  fallbackGlyph: string;
  channels: MotionChannel[];
  frames?: string[];
}

const GEOMETRIES: readonly MotionGeometry[] = [
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

const EASES = ["linear", "pulse", "breathe"] as const;

export function draftFromMotion(def: MotionDef): ComposerDraft {
  return {
    id: def.id,
    name: def.name,
    geometry: def.generator?.geometry ?? "linear",
    intervalMs: def.generator?.intervalMs ?? 100,
    trail: def.generator?.trail ?? 3,
    direction: def.generator?.direction ?? "forward",
    ease: def.generator?.ease ?? "linear",
    fallbackGlyph: def.fallbackGlyph,
    channels: [...def.channels],
    frames: def.frames ? [...def.frames] : undefined,
  };
}

export function draftFromId(id: string): ComposerDraft | null {
  const def = getMotion(id);
  return def ? draftFromMotion(def) : null;
}

export function patchComposerDraft(
  draft: ComposerDraft,
  patch: Partial<ComposerDraft>,
): ComposerDraft {
  const next = { ...draft, ...patch };
  next.intervalMs = Math.min(750, Math.max(50, Math.round(next.intervalMs)));
  next.trail = Math.min(8, Math.max(0, Math.round(next.trail)));
  if (next.channels.length === 0) next.channels = ["signal"];
  return next;
}

export function cycleGeometry(current: MotionGeometry): MotionGeometry {
  const index = GEOMETRIES.indexOf(current);
  return GEOMETRIES[(index + 1) % GEOMETRIES.length]!;
}

export function cycleEase(current: ComposerDraft["ease"]): ComposerDraft["ease"] {
  const index = EASES.indexOf(current);
  return EASES[(index + 1) % EASES.length]!;
}

export function toggleComposerChannel(
  draft: ComposerDraft,
  channel: MotionChannel,
): ComposerDraft {
  const has = draft.channels.includes(channel);
  const channels = has
    ? draft.channels.filter((item) => item !== channel)
    : [...draft.channels, channel];
  return patchComposerDraft(draft, { channels });
}

export function composerToMotion(draft: ComposerDraft): MotionDef {
  const generator: MotionGenerator = {
    geometry: draft.geometry,
    trail: draft.trail,
    direction: draft.direction,
    intervalMs: draft.intervalMs,
    ease: draft.ease,
  };
  return {
    id: draft.id,
    name: draft.name,
    category: "custom",
    kind: draft.frames?.length ? "frames" : "generator",
    channels: draft.channels,
    colorRole: "motionHot",
    fallbackGlyph: draft.fallbackGlyph,
    loop: "while-active",
    frames: draft.frames,
    generator,
    description: `Custom ${draft.geometry} motion at ${draft.intervalMs}ms.`,
  };
}

export function previewComposerFrames(
  draft: ComposerDraft,
  ticks = 6,
  ascii = false,
): string[] {
  const def = composerToMotion(draft);
  return Array.from({ length: ticks }, (_, tick) => frameAt(def, tick, ascii));
}

export function composerTimeline(draft: ComposerDraft, ticks = 5): string {
  const def = composerToMotion(draft);
  const frames = framesOf(def);
  const cells = Array.from({ length: ticks }, (_, tick) => {
    const glyph = frames[tick % frames.length] ?? draft.fallbackGlyph;
    return `${tick * draft.intervalMs}ms:${glyph}`;
  });
  return cells.join("  ");
}
