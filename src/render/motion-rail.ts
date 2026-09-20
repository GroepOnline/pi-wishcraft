/**
 * Compact Signal rail. It is deliberately a single terminal row: the rail
 * reports agent state, it never displaces the footer while a response streams.
 * Idle has no scheduler consumer; active work leases the shared scheduler.
 */

import { getMotion } from "../motion/catalog.ts";
import { frameAt, lanternGlow, sweepPhase, trailGlyph } from "../motion/frames.ts";
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
  const trueColor = colorEnabled() && !ascii;
  const headRgb = paletteRgb("accent");
  // Lantern tie-in: ember/heat heads flicker with the welcome lantern's
  // breathe-plus-ripple curve, so the signature flame lives in the rail.
  const lantern =
    def?.generator?.geometry === "ember" || def?.generator?.geometry === "heat";
  const glow = lantern ? 0.84 + 0.16 * lanternGlow(Date.now()) : 1;
  const flicker = (rgb: [number, number, number]): [number, number, number] =>
    rgb.map((channel) =>
      Math.min(255, Math.round(channel * glow + (255 - channel) * 0.09 * ((glow - 0.84) / 0.16))),
    ) as [number, number, number];
  const cellColor = (distance: number): string => {
    if (!trueColor) {
      if (distance === 0) return hot;
      if (distance === 1) return model;
      if (distance === 2) return path;
      return dim;
    }
    const intensity = 1 - Math.min(distance, trailDepth + 1) / (trailDepth + 1);
    if (distance <= 0.5) {
      const rgb = flicker(headRgb);
      return ansi.getFgAnsi(rgb[0], rgb[1], rgb[2]);
    }
    return fgGradientCode("accent", "sep", 1 - intensity);
  };

  let rail: string;
  if (!runtime.active) {
    // Do not derive idle state from Date.now(): there is intentionally no idle
    // animation clock, so a clock-derived rail otherwise changes only when an
    // unrelated repaint happens. The center marker makes ready glanceable.
    const center = Math.floor(railWidth / 2);
    rail = Array.from({ length: railWidth }, (_, index) =>
      paint(index === center ? (ascii ? "." : "⋄") : track, dim),
    ).join("");
  } else if (runtime.event === "compact") {
    rail = renderCompactRail(runtime.tick, railWidth, ascii, headGlyph, cellColor);
  } else {
    // Eased ping-pong sweep: the head decelerates at the edges and glides
    // back instead of teleporting from the last cell to the first.
    const pos = sweepPhase(runtime.tick, railWidth, true, direction, ease);
    rail = Array.from({ length: railWidth }, (_, index) => {
      const distance = direction === "forward" ? pos - index : index - pos;
      if (distance > -0.5 && distance <= 0.5) {
        return paint(headGlyph(runtime.tick, 0), cellColor(0));
      }
      if (distance > 0.5 && distance <= trailDepth + 0.5) {
        return paint(headGlyph(runtime.tick, Math.round(distance)), cellColor(distance));
      }
      return paint(track, dim);
    }).join("");
  }

  const edge = runtime.active ? hot : dim;
  const left = `${spec.caps.leftOpen ?? ""}${spec.separators.left}`;
  const right = `${spec.separators.right}${spec.caps.leftClose ?? ""}`;
  return `${paint(left, edge)}${rail}${paint(right, edge)} ${paint(label, runtime.active ? hot : dim)}`;
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
