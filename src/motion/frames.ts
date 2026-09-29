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

/**
 * Glyph for a motion at a given tick. Fractional ticks (sub-tick
 * interpolation) floor to the frame they are currently in, so integer ticks
 * behave exactly as before while interpolated positions stay smooth.
 */
export function frameAt(def: MotionDef, tick: number, ascii = false): string {
  if (ascii) return def.fallbackGlyph;
  const frames = framesOf(def);
  if (frames.length === 0) return def.fallbackGlyph;
  const index = Math.floor(((tick % frames.length) + frames.length) % frames.length);
  return frames[index] ?? def.fallbackGlyph;
}

/** Fractional tick count for an elapsed time at the given interval. */
export function fractionalTick(elapsedMs: number, intervalMs: number): number {
  if (intervalMs <= 0) return 0;
  return elapsedMs / intervalMs;
}

/** Glyph for a motion at a given elapsed time, using its own interval. */
export function frameAtElapsed(def: MotionDef, elapsedMs: number, ascii = false): string {
  const interval = def.generator?.intervalMs ?? 100;
  return frameAt(def, fractionalTick(elapsedMs, interval), ascii);
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
 * True during the return leg of a ping-pong traversal — when the head is
 * travelling back toward its starting edge. Callers orient the trail from
 * this so the wake always trails the head on both legs.
 */
export function sweepReturning(tick: number, width: number): boolean {
  if (width <= 1) return false;
  const span = width - 1;
  const period = 2 * span;
  const phase = ((tick % period) + period) % period;
  return phase > span;
}

/**
 * True while the head travels rightward on its current leg — including the
 * return leg, where the configured direction is effectively flipped. Callers
 * orient the wake from this so it always trails the head.
 */
export function sweepMovingRight(
  tick: number,
  width: number,
  direction: "forward" | "reverse" = "forward",
): boolean {
  return (direction === "forward") !== sweepReturning(tick, width);
}

/**
 * Sub-tick interpolation between scheduler heartbeats: `tick` plus how far
 * the clock is past the last heartbeat at `intervalMs` cadence. Strictly one
 * interval wide — anything outside it means the heartbeat source is stale or
 * the clocks disagree (tests driving ticks by hand), and the plain tick is the
 * honest value there. This is what keeps motion smooth when repaints happen
 * between ticks, without ever jumping ahead of the scheduler.
 */
export function interpTick(
  tick: number,
  lastTickAt: number | undefined,
  now: number | undefined,
  intervalMs: number,
): number {
  if (lastTickAt === undefined || now === undefined || intervalMs <= 0) return tick;
  const progress = (now - lastTickAt) / intervalMs;
  if (!(progress > 0 && progress <= 1)) return tick;
  return tick + progress;
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

// ---------------------------------------------------------------------------
// Braille wake — sub-cell curve density for wave/heat/liquid geometries.
// One rail cell stays one column: a braille glyph packs a 2×4 dot matrix,
// so the wake renders a smooth curve instead of four flat glyph steps.
// ---------------------------------------------------------------------------

/** Geometries rendered with the braille wake instead of flat frame glyphs. */
const BRAILLE_GEOMETRIES: ReadonlySet<string> = new Set(["wave", "heat", "liquid"]);

export function isBrailleGeometry(def: MotionDef | undefined): boolean {
  return def?.kind === "generator" && BRAILLE_GEOMETRIES.has(def.generator?.geometry ?? "");
}

/** Bottom-to-top braille bit for the left and right dot columns. */
const BRAILLE_ROWS_LEFT = [0x40, 0x04, 0x02, 0x01] as const;
const BRAILLE_ROWS_RIGHT = [0x80, 0x20, 0x10, 0x08] as const;

function brailleColumnBits(rows: readonly number[], height: number): number {
  if (height <= 0) return 0;
  const full = Math.min(4, Math.floor(height));
  let bits = 0;
  for (let row = 0; row < full; row++) bits |= rows[row]!;
  // Fractional top dot flickers in above ~1/3 fill — the last bit of
  // sub-cell resolution the 2×4 matrix can express.
  if (full < 4 && height - full > 0.34) bits |= rows[full]!;
  return bits;
}

/** One braille glyph from two 0..1 fill levels (left, right sub-column). */
export function brailleGlyph(leftLevel: number, rightLevel: number): string {
  const dots = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v) * 4;
  const pattern =
    brailleColumnBits(BRAILLE_ROWS_LEFT, dots(leftLevel)) |
    brailleColumnBits(BRAILLE_ROWS_RIGHT, dots(rightLevel));
  return String.fromCharCode(0x2800 + pattern);
}

/**
 * Wake glyph for a braille cell at `column` while the head sits at
 * `headPos` (both fractional). `envelope` (0..1) is the glow falloff for
 * this cell's distance behind the head; `timePhase` in [0, 1) undulates
 * the curve so the wake ripples even while the head crawls.
 */
export function brailleWakeGlyph(
  column: number,
  headPos: number,
  envelope: number,
  timePhase: number,
): string {
  const spatial = (headPos - column) * 1.7;
  const temporal = timePhase * Math.PI * 2;
  const wave = 0.5 + 0.5 * Math.sin(spatial + temporal);
  const level = envelope * (0.18 + 0.82 * wave);
  // Half-cell stagger: the two sub-columns sample the curve half a step
  // apart, which is what makes one column read as a slope instead of a bar.
  const rightWave = 0.5 + 0.5 * Math.sin(spatial + 0.85 + temporal);
  const rightLevel = envelope * (0.18 + 0.82 * rightWave);
  return brailleGlyph(level, rightLevel);
}

// ---------------------------------------------------------------------------
// Event gestures — one-shot shapes for terminal/one-shot events. All are
// pure functions of tick/width so tests can pin them; finite loops with
// maxTicks keep idle cost at zero frames afterwards.
// ---------------------------------------------------------------------------

export interface RippleRing {
  /** Fractional left/right edge of the ring; equals -1 when inactive. */
  left: number;
  right: number;
  /** 1 at birth → 0 at death; drives the ring's brightness. */
  life: number;
}

/**
 * Expanding rings from the rail center for terminal events (success,
 * warning, error). Two rings: the first sweeps the whole span over the
 * gesture, the second follows half a gesture behind, so the rail reads as
 * a pulse echoing outward instead of a single border flash.
 */
export function rippleRings(tick: number, width: number, maxTicks: number): RippleRing[] {
  if (width < 3 || maxTicks <= 0) return [];
  const center = (width - 1) / 2;
  const maxRadius = Math.max(1, center);
  const progress = Math.min(1, Math.max(0, tick / maxTicks));
  const rings: RippleRing[] = [];
  for (const offset of [0, 0.5]) {
    const p = progress - offset;
    if (p <= 0 || p >= 1) {
      rings.push({ left: -1, right: -1, life: 0 });
      continue;
    }
    const radius = p * maxRadius;
    const life = (1 - p) ** 1.4;
    rings.push({ left: center - radius, right: center + radius, life });
  }
  return rings;
}

/**
 * Ignition flash for the head after an event switch: a fast exponential
 * decay from `startedAt`, so the first half-second of any active event
 * burns brighter and then settles — the punch that makes state changes
 * land. Deterministic in `elapsedMs`.
 */
export function punchEnvelope(elapsedMs: number, halfLifeMs = 220): number {
  if (elapsedMs <= 0) return 0;
  return 0.5 ** (elapsedMs / halfLifeMs);
}
