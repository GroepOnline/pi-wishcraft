/**
 * Motion rail (v2). Renders the Signal activity rail — the animated
 * sweep/compact rail plus activity label — as a first-class layout segment.
 * Extracted from the legacy v1 Signal renderer (src/signal/render.ts,
 * deleted in the U12 cutover); rail semantics are unchanged: idle = flat
 * rail, streaming = travelling head + trail, compacting = inward heads.
 */

import { sweepPosition, trailGlyph } from "../motion/index.ts";
import { fatBand } from "./motion-candidates.ts";

const BOLD = "\x1b[1m";
import type { SignalRuntime } from "../signal/controller.ts";
import type { SignalSpec } from "../config/types.ts";
import { ansi, colorEnabled, getFgAnsiCode } from "../theme/colors.ts";

export function renderActivity(
  runtime: SignalRuntime,
  spec: SignalSpec,
  ascii = false,
): string {
  const label = runtime.activity || "ready";
  const open = spec.caps.leftOpen ?? "";
  const close = spec.caps.leftClose ?? "";
  const dim = getFgAnsiCode("sep");
  const hot = getFgAnsiCode("accent");
  const reset = colorEnabled() ? ansi.reset : "";
  // One glyph family, directional comet: light `─` track, fixed solid
  // head, and a short box-drawing trail ONLY behind the head. Idle is a
  // calm flat rail (no cycling glyphs — the old shade-block cloud read
  // muddy across three unrelated glyph families).
  const RAIL_WIDTH = 12;
  const track = ascii ? "-" : "─";
  const head = ascii ? "o" : "●";
  let railInner: string;
  if (!runtime.active) {
    railInner = track.repeat(RAIL_WIDTH);
  } else if (runtime.activity === "compacting") {
    // Compact state: two heads travel inward and compress a heavy core —
    // visually distinct from the sweep so compaction reads at a glance.
    railInner = renderCompactRail(runtime.tick, RAIL_WIDTH, ascii);
  } else {
    // Activity→geometry mapping: motion carries meaning. Streaming tokens
    // ride a 1/8-block topographic fat-band (bolded peaks) — ~5x perceived
    // mass vs the single-row braille wave, one row so layout stays
    // untouched. Other active states keep the directional comet;
    // compacting squeezes. The proper 3-row sigil lives in
    // motion-candidates as the OMP-intro step-up (separate header PR).
    if (runtime.activity === "streaming" && !ascii) {
      const [top] = fatBand(runtime.tick, false);
      const peak = /[▆▇█]/;
      railInner = colorEnabled()
        ? top
            .split("")
            .map((g) => (peak.test(g) ? `${BOLD}${g}${ansi.reset}` : g))
            .join("")
        : top;
    } else {
      const pos = sweepPosition(runtime.tick, RAIL_WIDTH, true);
      const built: string[] = [];
      for (let i = 0; i < RAIL_WIDTH; i++) {
        if (i === pos) built.push(head);
        else if (i < pos) built.push(trailGlyph(Math.min(pos - i, 4), ascii));
        else built.push(track);
      }
      railInner = built.join("");
    }
  }
  const railColor = runtime.active ? hot : dim;
  const rail = `${spec.separators.left}${railInner}${spec.separators.right}`;
  return `${railColor}${open}${rail}${close}${reset} ${label}`;
}

/**
 * Compact rail: two heads travel inward toward center, compressing the rail.
 * Gives compaction a distinct visual signature vs the generic sweep.
 */
function renderCompactRail(
  tick: number,
  width: number,
  ascii: boolean,
): string {
  const half = Math.floor(width / 2);
  // Heads oscillate from the edges toward center and back.
  const span = half;
  const phase = tick % (span * 2);
  const inward = phase < span ? phase : span * 2 - phase;
  const leftPos = inward;
  const rightPos = width - 1 - inward;
  const head = ascii ? "*" : "●";
  const core = ascii ? "=" : "━";
  const track = ascii ? "-" : "─";
  let built = "";
  for (let i = 0; i < width; i++) {
    if (i === leftPos || i === rightPos) built += head;
    else built += i > leftPos && i < rightPos ? core : track;
  }
  return built;
}