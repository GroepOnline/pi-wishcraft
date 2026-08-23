/**
 * Travelling Signal rail. One cell per column; head + trail move with tick.
 */

import { sweepPosition, trailGlyph } from "../motion/frames.ts";

export const SIGNAL_RAIL_WIDTH = 16;

export interface RailSweepOptions {
  tick: number;
  width: number;
  animating: boolean;
  ascii?: boolean;
  trail?: number;
  direction?: "forward" | "reverse";
}

/** Paint a rail of `width` cells. Idle rails are still; active rails sweep. */
export function renderRailSweep(options: RailSweepOptions): string {
  const width = Math.max(0, Math.floor(options.width));
  if (width === 0) return "";
  const ascii = options.ascii ?? false;
  const track = ascii ? "-" : "━";
  if (!options.animating) return track.repeat(width);

  const pos = sweepPosition(options.tick, width, true, options.direction ?? "forward");
  const trail = options.trail ?? 3;
  let out = "";
  for (let i = 0; i < width; i++) {
    const distance = Math.abs(i - pos);
    out += distance <= trail ? trailGlyph(distance, ascii) : track;
  }
  return out;
}

export function railHeadIndex(tick: number, width: number, animating: boolean): number {
  return sweepPosition(tick, width, animating);
}
