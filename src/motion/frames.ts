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
  // Density-pulse families (box-drawing, één glyphsysteem — shade-blokken
  // zijn bewust weg: drie families door elkaar las als modder).
  heat: ["─", "╌", "╾", "━", "╾", "╌"],
  liquid: ["·", "╌", "╾", "━"],
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

export type SweepEase = "linear" | "pulse" | "breathe";

/**
 * Eased traversal progress. `linear` keeps a constant velocity, `pulse`
 * accelerates through the middle and settles at the edges, `breathe`
 * dwells longest at the ends before turning. All curves are symmetric so
 * the ping-pong turn at each edge stays continuous — no teleport wrap.
 */
function easeProgress(s: number, ease: SweepEase): number {
  if (ease === "pulse") return (1 - Math.cos(Math.PI * s)) / 2;
  if (ease === "breathe") {
    // easeInOutQuart: long dwell at the ends, quick through the middle
    return s < 0.5 ? 8 * s * s * s * s : 1 - 8 * (1 - s) ** 4;
  }
  return s;
}

/**
 * Fractional position of a travelling head across `width` cells on a
 * ping-pong traversal (no teleport wrap: the head decelerates, turns at
 * the edge and glides back). Returns -1 when not animating. The fractional
 * part lets color ramps fade between cells while glyphs round to one column.
 */
export function sweepPhase(
  tick: number,
  width: number,
  animating: boolean,
  direction: "forward" | "reverse" = "forward",
  ease: SweepEase = "linear",
): number {
  if (!animating || width <= 1) return animating && width === 1 ? 0 : -1;
  const span = width - 1;
  const period = 2 * span;
  const phase = ((tick % period) + period) % period;
  const s = phase <= span ? phase / span : (period - phase) / span;
  const eased = easeProgress(s, ease) * span;
  return direction === "reverse" ? span - eased : eased;
}

/**
 * Position of a travelling head across `width` cells. Ping-pong traversal:
 * the head bounces at the edges instead of wrapping. Returns -1 when the
 * motion is not animating, so callers can render a still rail.
 */
export function sweepPosition(
  tick: number,
  width: number,
  animating: boolean,
  direction: "forward" | "reverse" = "forward",
  ease: SweepEase = "linear",
): number {
  const phase = sweepPhase(tick, width, animating, direction, ease);
  return phase < 0 ? -1 : Math.round(phase);
}

/**
 * Trail glyph by distance behind the travelling head. One family:
 * box-drawing density fading back to the light track — no shade blocks.
 */
export function trailGlyph(distance: number, ascii = false): string {
  if (ascii) {
    if (distance === 0) return "*";
    if (distance === 1) return "=";
    if (distance === 2) return ">";
    return "-";
  }
  if (distance === 0) return "●";
  if (distance === 1) return "━";
  if (distance === 2) return "╾";
  if (distance === 3) return "╌";
  return "─";
}
