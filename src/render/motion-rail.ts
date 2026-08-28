/**
 * Motion rail (v2). Renders the Signal activity rail — the animated
 * sweep/compact rail plus activity label — as a first-class layout segment.
 * Extracted from the legacy v1 Signal renderer (src/signal/render.ts,
 * deleted in the U12 cutover); rail semantics are unchanged: idle = flat
 * rail, streaming = travelling head + trail, compacting = inward heads.
 */

import { sweepPosition, trailGlyph } from "../motion/index.ts";
import type { SignalRuntime } from "../signal/controller.ts";
import type { SignalSpec } from "../config/types.ts";
import { ansi, colorEnabled, getFgAnsiCode } from "../theme/colors.ts";
import { lanternSigil } from "./motion-candidates.ts";

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
  let railBlock: string;
  if (!runtime.active) {
    railBlock = track.repeat(RAIL_WIDTH);
  } else if (runtime.activity === "compacting") {
    // Compact state: two heads travel inward and compress a heavy core —
    // visually distinct from the sweep so compaction reads at a glance.
    railBlock = renderCompactRail(runtime.tick, RAIL_WIDTH, ascii);
  } else {
    const pos = sweepPosition(runtime.tick, RAIL_WIDTH, true);
    const built: string[] = [];
    for (let i = 0; i < RAIL_WIDTH; i++) {
      if (i === pos) built.push(head);
      else if (i < pos) built.push(trailGlyph(Math.min(pos - i, 4), ascii));
      else built.push(track);
    }
    railBlock = built.join("");
  }
  // Active state: 3-row lantern sigil ONLY for the streaming/working
  // activity (the visible "the model is doing something" pulse). Other
  // active states keep their 1-row rails (compacting = inward heads,
  // ready/empty = calm flat). The sigil is a braille-block lantern;
  // there is no honest 12-col ASCII equivalent — fall back to comet.
  if (runtime.active && !ascii && runtime.activity === "streaming") {
    const sigilRows = lanternSigil(runtime.tick, false);
    const [r0, ...rest] = sigilRows;
    const framed = `${spec.separators.left}${r0} ${label}${spec.separators.right}`;
    railBlock = [framed, ...rest].join("\n");
    const railColor = runtime.active ? hot : dim;
    return `${railColor}${open}${railBlock}${close}${reset}`;
  }
  const railColor = runtime.active ? hot : dim;
  const rail = `${spec.separators.left}${railBlock}${spec.separators.right}`;
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