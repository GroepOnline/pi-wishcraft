/**
 * Signal rail. One terminal row that reports the agent's state:
 *   resting      — a slow breathing glow on the shared ambient clock
 *   streaming    — the lane's own motion frames sweep the rail with a
 *                  hot head, cooling wake, and faint sparks ahead
 *   compacting   — two heads squeeze inward with a thermal core
 *
 * The rail never grows taller than one row: the footer stays put while
 * a response streams. Reduced-motion policy drops both the ambient and
 * the signal channel, leaving a stable dim marker.
 */

import { defaultMotionFor, getMotion } from "../motion/catalog.ts";
import { frameAt, framesOf, sweepPosition, trailGlyph } from "../motion/frames.ts";
import type { SignalRuntime } from "../signal/controller.ts";
import type { SignalSpec } from "../config/types.ts";
import { ansi, colorEnabled, getFgAnsiCode } from "../theme/colors.ts";

function paint(text: string, color: string): string {
  if (!color || !colorEnabled()) return text;
  return `${color}${text}${ansi.reset}`;
}

/** A rail cell must always occupy exactly one column — multi-column frames
 * (e.g. writing-reveal's growing dashes) are clipped to their first glyph
 * so the layout never drifts under animation. */
function cellGlyph(value: string, fallback: string): string {
  return Array.from(value)[0] ?? fallback;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function scene(duration: number, tick: number): number {
  return (((tick % duration) + duration) % duration) / duration;
}

export function renderActivity(
  runtime: SignalRuntime,
  spec: SignalSpec,
  ascii = false,
  width = 80,
): string {
  const label = runtime.activity || "ready";
  const dim = getFgAnsiCode("sep");
  const model = getFgAnsiCode("model");
  const path = getFgAnsiCode("path");
  const hot = getFgAnsiCode("accent");
  const track = ascii ? "-" : "─";
  // A footer rail is state indication, not a hero animation. Bounded so
  // operational segments keep their width on wide terminals.
  const railWidth = Math.max(12, Math.min(22, Math.round(width * 0.1)));
  const def = getMotion(runtime.motionId);
  const direction = def?.generator?.direction === "reverse" ? "reverse" : "forward";
  const trailDepth = Math.max(2, Math.min(6, def?.generator?.trail ?? 4));
  const headFallback = ascii ? "o" : "●";
  const frames = def && !ascii ? framesOf(def) : null;
  const headGlyph = (tick: number, distance: number): string => {
    if (ascii) return distance === 0 ? headFallback : trailGlyph(distance, true);
    const frame = frames?.[Math.max(0, tick - distance) % frames.length];
    return cellGlyph(frame ?? headFallback, headFallback);
  };
  const cellColor = (distance: number): string => {
    if (distance === 0) return hot;
    if (distance === 1) return model;
    if (distance === 2) return path;
    return dim;
  };

  let rail: string;
  if (!runtime.active) {
    rail = runtime.idleAnimated && !ascii
      ? renderIdleRail(runtime.tick, railWidth, dim, model, hot)
      : renderStaticRail(railWidth, ascii, dim);
  } else if (runtime.event === "compact") {
    rail = renderCompactRail(runtime.tick, railWidth, ascii, headGlyph, cellColor);
  } else {
    rail = renderSweepRail(
      runtime.tick, railWidth, ascii, direction, trailDepth,
      headGlyph, cellColor, frames, dim, track,
    );
  }

  const edge = runtime.active ? hot : dim;
  const left = `${spec.caps.leftOpen ?? ""}${spec.separators.left}`;
  const right = `${spec.separators.right}${spec.caps.leftClose ?? ""}`;
  return `${paint(left, edge)}${rail}${paint(right, edge)} ${paint(label, runtime.active ? hot : dim)}`;
}

/**
 * Resting rail: a warm radial glow that slowly breathes and shimmers per
 * cell. Driven purely by the ambient tick — deterministic in tests, alive
 * in the terminal, and zero cost when motion is reduced or off.
 */
function renderIdleRail(
  tick: number,
  width: number,
  dim: string,
  model: string,
  hot: string,
): string {
  const idleDef = getMotion(defaultMotionFor("idle"));
  const idleFrames = idleDef ? framesOf(idleDef) : ["◌", "◎", "◈", "⬡", "◈", "◎"];
  const phase = scene(96, tick); // one full breath in ~96 ambient ticks
  const center = (width - 1) / 2;
  const built: string[] = [];
  for (let i = 0; i < width; i++) {
    // A calm ember in the middle: quiet track on the flanks, a warm glow
    // that slowly breathes and shimmers around the centre. Only cells
    // above the glow threshold carry the idle frames — the rest stay as
    // plain track so the rail never reads as one cycling glyph wall.
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

function renderStaticRail(
  width: number,
  ascii: boolean,
  dim: string,
): string {
  const center = Math.floor(width / 2);
  const track = ascii ? "-" : "─";
  return Array.from({ length: width }, (_, index) =>
    paint(index === center ? (ascii ? "." : "⋄") : track, dim),
  ).join("");
}

function renderSweepRail(
  tick: number,
  width: number,
  ascii: boolean,
  direction: "forward" | "reverse",
  trailDepth: number,
  headGlyph: (tick: number, distance: number) => string,
  cellColor: (distance: number) => string,
  frames: string[] | null,
  dim: string,
  track: string,
): string {
  const pos = sweepPosition(tick, width, true, direction);
  const built: string[] = [];
  for (let i = 0; i < width; i++) {
    const distance = direction === "forward" ? pos - i : i - pos;
    if (distance === 0) {
      built.push(paint(headGlyph(tick, 0), cellColor(0)));
      continue;
    }
    if (distance > 0 && distance <= trailDepth) {
      built.push(paint(headGlyph(tick, distance), cellColor(distance)));
      continue;
    }
    // Sparks ahead of the head: a deterministic 1-in-N twinkle so the
    // sweep feels alive without random jitter between frames.
    const ahead = -distance;
    const spark =
      !ascii &&
      frames !== null &&
      ahead >= 1 &&
      ahead <= 3 &&
      (tick * 7 + i * 13) % 8 < (ahead === 1 ? 2 : 1);
    built.push(
      spark
        ? paint(cellGlyph(frames[(tick + i) % frames.length]!, "·"), dim)
        : paint(track, dim),
    );
  }
  return built.join("");
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