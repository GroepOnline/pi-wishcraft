/**
 * Compact Signal rail. It is deliberately a single terminal row: the rail
 * reports agent state, it never displaces the footer while a response streams.
 * Full-motion idle leases the scheduler's ambient channel and breathes from
 * that tick. Reduced and off motion stay a static marker with no consumer.
 * Active work leases the signal channel.
 */

import { defaultMotionFor, getMotion } from "../motion/catalog.ts";
import { frameAt, framesOf, lanternGlow, sweepPhase, sweepReturning, trailGlyph } from "../motion/frames.ts";
import { fatBand } from "./motion-candidates.ts";
import type { SignalRuntime } from "../signal/controller.ts";
import type { SignalSpec } from "../config/types.ts";
import { ansi, colorEnabled, fgGradientCode, getFgAnsiCode, paletteRgb } from "../theme/colors.ts";

function paint(text: string, color: string): string {
  if (!color || !colorEnabled()) return text;
  return `${color}${text}${ansi.reset}`;
}

/** Generators such as writing-reveal may contain several columns. A rail cell
 * must always occupy exactly one column or its layout drifts under animation. */
function cellGlyph(value: string, fallback: string): string {
  return Array.from(value)[0] ?? fallback;
}

interface RailPalette {
  /** Truecolor ramp when color is on and glyphs are not ASCII. */
  trueColor: boolean;
  trailDepth: number;
  headRgb: [number, number, number];
  /** Lantern flicker factors; 1 / 0 disable the flicker for non-ember heads. */
  flickerScale: number;
  flickerWhite: number;
  hot: string;
  model: string;
  path: string;
  dim: string;
}

/** Color for a rail cell at `distance` behind the travelling head. */
function railCellColor(distance: number, p: RailPalette): string {
  if (!p.trueColor) {
    if (distance === 0) return p.hot;
    if (distance === 1) return p.model;
    if (distance === 2) return p.path;
    return p.dim;
  }
  if (distance <= 0.5) {
    const rgb = p.headRgb.map((channel) =>
      Math.min(255, Math.round(channel * p.flickerScale + (255 - channel) * p.flickerWhite)),
    ) as [number, number, number];
    return ansi.getFgAnsi(rgb[0], rgb[1], rgb[2]);
  }
  // Smooth wake: fade the hot head back to the dim track by fractional
  // distance, so trail cells cool off instead of stepping through tiers.
  return fgGradientCode("accent", "sep", Math.min(distance, p.trailDepth + 1) / (p.trailDepth + 1));
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Map a scheduler tick to a repeating phase in the half-open range [0, 1). */
function scene(duration: number, tick: number): number {
  return (((tick % duration) + duration) % duration) / duration;
}

/**
 * Render the one-line Signal rail and its activity label.
 *
 * `width` is the available status-line width used to size the rail. ASCII mode
 * uses single-column fallback glyphs and a static marker while idle.
 */
export function renderActivity(
  runtime: SignalRuntime,
  spec: SignalSpec,
  ascii = false,
  width = 80,
): string {
  const label = runtime.activity || "ready";
  const dim = getFgAnsiCode("sep");
  const hot = getFgAnsiCode("accent");
  const model = getFgAnsiCode("model");
  const path = getFgAnsiCode("path");
  const track = ascii ? "-" : "─";
  // A footer rail is state indication, not a hero animation. Keep it readable
  // on wide terminals and leave enough room for actual operational segments.
  const railWidth = Math.max(12, Math.min(22, Math.round(width * 0.1)));
  const def = getMotion(runtime.motionId);
  const direction = def?.generator?.direction === "reverse" ? "reverse" : "forward";
  const ease = def?.generator?.ease ?? "linear";
  const trailDepth = Math.max(2, Math.min(6, def?.generator?.trail ?? 4));
  const headFallback = ascii ? "o" : "●";
  const headGlyph = (tick: number, distance: number) => {
    if (ascii) return distance === 0 ? headFallback : trailGlyph(distance, true);
    return def ? cellGlyph(frameAt(def, tick - Math.round(distance)), headFallback) : headFallback;
  };
  // Lantern tie-in: ember/heat heads flicker with the welcome lantern's
  // breathe-plus-ripple curve, so the signature flame lives in the rail.
  const lantern =
    def?.generator?.geometry === "ember" || def?.generator?.geometry === "heat";
  const glow = lantern ? 0.84 + 0.16 * lanternGlow(Date.now()) : 1;
  const palette: RailPalette = {
    trueColor: colorEnabled() && !ascii,
    trailDepth,
    headRgb: paletteRgb("accent"),
    flickerScale: glow,
    flickerWhite: lantern ? 0.09 * ((glow - 0.84) / 0.16) : 0,
    hot,
    model,
    path,
    dim,
  };
  const cellColor = (distance: number): string => railCellColor(distance, palette);

  let rail: string;
  if (!runtime.active) {
    rail = runtime.idleAnimated && !ascii
      ? renderBreathingRail(runtime.tick, railWidth, dim, model, hot)
      : renderIdleRail(railWidth, ascii, track, dim);
  } else if (runtime.event === "compact") {
    rail = renderCompactRail(runtime.tick, railWidth, ascii, headGlyph, cellColor);
  } else if (runtime.motionId === "fat-band") {
    rail = renderFatBandRail(runtime.tick, railWidth, ascii, hot);
  } else {
    rail = renderSweepRail(runtime.tick, railWidth, direction, ease, trailDepth, track, headGlyph, cellColor, dim);
  }

  const edge = runtime.active ? hot : dim;
  const left = `${spec.caps.leftOpen ?? ""}${spec.separators.left}`;
  const right = `${spec.separators.right}${spec.caps.leftClose ?? ""}`;
  return `${paint(left, edge)}${rail}${paint(right, edge)} ${paint(label, runtime.active ? hot : dim)}`;
}

/**
 * Resting rail on the ambient tick. A warm radial glow breathes and
 * shimmers per cell. The same tick always paints the same rail, so tests
 * can advance `runtime.tick` without sampling the wall clock.
 */
function renderBreathingRail(
  tick: number,
  width: number,
  dim: string,
  model: string,
  hot: string,
): string {
  const idleDef = getMotion(defaultMotionFor("idle"));
  const idleFrames = idleDef ? framesOf(idleDef) : ["◌", "◎", "◈", "⬡", "◈", "◎"];
  const phase = scene(96, tick);
  const center = (width - 1) / 2;
  const built: string[] = [];
  for (let i = 0; i < width; i++) {
    const radial = Math.cos(((i - center) / Math.max(1, center)) * Math.PI * 0.5);
    const shimmer = 0.22 * Math.sin(phase * Math.PI * 2 + i * 0.9);
    const level = clamp01(radial * 0.9 + 0.1 + shimmer);
    if (level <= 0.45) {
      built.push(paint("─", dim));
      continue;
    }
    const frameIdx = Math.floor(level * (idleFrames.length - 1)) % idleFrames.length;
    const glyph = cellGlyph(idleFrames[frameIdx] ?? "", "·");
    const color = level > 0.72 ? hot : model;
    built.push(paint(glyph, color));
  }
  return built.join("");
}

/** Static idle rail. Reduced and off motion never lease a consumer, so the
 * marker must not change between unrelated repaints. */
function renderIdleRail(
  width: number,
  ascii: boolean,
  track: string,
  dim: string,
): string {
  const center = Math.floor(width / 2);
  return Array.from({ length: width }, (_, index) =>
    paint(index === center ? (ascii ? "." : "⋄") : track, dim),
  ).join("");
}

/** Eased ping-pong sweep: the head decelerates at the edges and glides back
 * instead of teleporting from the last cell to the first. */
function renderSweepRail(
  tick: number,
  width: number,
  direction: "forward" | "reverse",
  ease: "linear" | "pulse" | "breathe",
  trailDepth: number,
  track: string,
  headGlyph: (tick: number, distance: number) => string,
  cellColor: (distance: number) => string,
  dim: string,
): string {
  const pos = sweepPhase(tick, width, true, direction, ease);
  // Orient the wake by the current leg, not just the configured direction:
  // on the return leg the head travels the other way, so "behind" flips.
  const movingRight = (direction === "forward") !== sweepReturning(tick, width);
  return Array.from({ length: width }, (_, index) => {
    const distance = movingRight ? pos - index : index - pos;
    if (distance > -0.5 && distance <= 0.5) {
      return paint(headGlyph(tick, 0), cellColor(0));
    }
    if (distance > 0.5 && distance <= trailDepth + 0.5) {
      return paint(headGlyph(tick, Math.round(distance)), cellColor(distance));
    }
    return paint(track, dim);
  }).join("");
}

/** Topographic streaming rail. One row, so the footer layout does not grow. */
function renderFatBandRail(tick: number, width: number, ascii: boolean, hot: string): string {
  const [top] = fatBand(tick, ascii, width);
  if (!top) return "";
  if (ascii || !colorEnabled()) return top;
  const peak = /[▆▇█]/;
  const body = getFgAnsiCode("model");
  return Array.from(top)
    .map((glyph) => paint(glyph, peak.test(glyph) ? hot : body))
    .join("");
}

function renderCompactRail(
  tick: number,
  width: number,
  ascii: boolean,
  headGlyph: (tick: number, distance: number) => string,
  cellColor: (distance: number) => string,
): string {
  const half = Math.floor(width / 2);
  const phase = tick % (half * 2);
  const inward = phase < half ? phase : half * 2 - phase;
  const left = inward;
  const right = width - 1 - inward;
  const core = ascii ? "=" : "━";
  const track = ascii ? "-" : "─";
  const dim = getFgAnsiCode("sep");

  return Array.from({ length: width }, (_, index) => {
    if (index === left || index === right) {
      return paint(headGlyph(tick, 0), cellColor(0));
    }
    if (index > left && index < right) {
      const distance = Math.min(index - left, right - index);
      return paint(core, cellColor(distance));
    }
    return paint(track, dim);
  }).join("");
}
