/**
 * frames.ts
 * ---------------------------------------------------------------------------
 * Frame resolution for motion definitions. Frame arrays and procedural
 * generators both reduce to a glyph for a given tick, with an ASCII fallback.
 *
 * `lanternGlow` is the flicker curve from the welcome lantern (a slow breathe
 * plus a fast ripple). vNext reuses it as Lanternwake's ember, now driven by
 * motion events instead of running unconditionally.
 * ---------------------------------------------------------------------------
 */

import type { MotionDef } from "./types.ts";

const GEOMETRY_FRAMES: Record<string, string[]> = {
  ember: ["◇", "◈", "◆", "◈"],
  orbit: ["◜", "◝", "◞", "◟"],
  bloom: ["·", "◇", "◈", "◆", "◈", "◇"],
  heat: ["░", "▒", "▓", "█", "▓", "▒"],
  liquid: ["·", "░", "▒", "▓", "█"],
  stitch: ["·", "╼", "◆", "╾"],
  refract: ["╭", "╮", "╯", "╰"],
  write: ["─", "──", "───", "────╾"],
  path: ["·", "✦", "◆", "✦"],
  wave: ["⠁", "⠉", "⠋", "⠛", "⠟", "⠿"],
  linear: ["━", "╾", "◆", "╼"],
};

/** Glyph for a motion at a given tick. */
export function frameAt(def: MotionDef, tick: number, ascii = false): string {
  if (ascii) return def.fallbackGlyph;
  const frames = framesOf(def);
  if (frames.length === 0) return def.fallbackGlyph;
  const index = ((tick % frames.length) + frames.length) % frames.length;
  return frames[index] ?? def.fallbackGlyph;
}

/** Glyph for a motion at a given elapsed time, using its own interval. */
export function frameAtElapsed(def: MotionDef, elapsedMs: number, ascii = false): string {
  const interval = def.generator?.intervalMs ?? 100;
  return frameAt(def, Math.floor(elapsedMs / interval), ascii);
}

export function framesOf(def: MotionDef): string[] {
  if (def.kind === "frames" && def.frames?.length) return def.frames;
  const geometry = def.generator?.geometry ?? "linear";
  return GEOMETRY_FRAMES[geometry] ?? [def.fallbackGlyph];
}

/**
 * Lantern flicker: slow breathe plus fast ripple, normalised to 0..1.
 * Mirrors the curve in src/welcome/lantern.ts.
 */
export function lanternGlow(nowMs: number): number {
  const t = nowMs / 1000;
  const breathe = Math.sin(t * 1.1) * 0.5 + 0.5;
  const ripple = Math.sin(t * 7.3) * 0.5 + 0.5;
  return 0.55 * breathe + 0.45 * ripple;
}

/**
 * Position of a travelling head across `width` cells. Returns -1 when the
 * motion is not animating, so callers can render a still rail.
 */
export function sweepPosition(
  tick: number,
  width: number,
  animating: boolean,
  direction: "forward" | "reverse" = "forward",
): number {
  if (!animating || width <= 0) return -1;
  const step = ((tick % width) + width) % width;
  return direction === "reverse" ? width - 1 - step : step;
}

/** Trail glyph by distance from the travelling head. */
export function trailGlyph(distance: number, ascii = false): string {
  if (ascii) return distance === 0 ? "*" : "-";
  if (distance === 0) return "█";
  if (distance === 1) return "▓";
  if (distance === 2) return "▒";
  if (distance === 3) return "░";
  return "━";
}
