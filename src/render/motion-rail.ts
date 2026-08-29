/**
 * Motion rail (v2). Renders the Signal activity rail — the animated
 * sweep/compact rail plus activity label — as a first-class layout segment.
 * Extracted from the legacy v1 Signal renderer (src/signal/render.ts,
 * deleted in the U12 cutover); rail semantics are unchanged: idle = flat
 * rail, streaming = travelling head + trail, compacting = inward heads.
 */

import {
  defaultMotionFor,
  frameAt,
  framesOf,
  getMotion,
  sweepPosition,
  trailGlyph,
} from "../motion/index.ts";
import type { SignalRuntime } from "../signal/controller.ts";
import type { SignalSpec } from "../config/types.ts";
import { ansi, colorEnabled, getFgAnsiCode } from "../theme/colors.ts";
import { lanternSigil } from "./motion-candidates.ts";

export function renderActivity(
  runtime: SignalRuntime,
  spec: SignalSpec,
  ascii = false,
  width = 80,
): string {
  const label = runtime.activity || "ready";
  const open = spec.caps.leftOpen ?? "";
  const close = spec.caps.leftClose ?? "";
  const dim = getFgAnsiCode("sep");
  const hot = getFgAnsiCode("accent");
  const reset = colorEnabled() ? ansi.reset : "";
  // Adaptive rail width: ~20% of terminal, clamped [16, 40]. Wider
  // terminals get a longer sweep so the motion reads at a glance.
  const RAIL_WIDTH = Math.max(16, Math.min(40, Math.round(width * 0.2)));
  const track = ascii ? "-" : "─";
  const head = ascii ? "o" : "●";
  const railColor = runtime.active ? hot : dim;
  const def = getMotion(runtime.motionId);
  // The head glyph is the chosen motion's own frame — so ember-relay
  // sweeps a ◇→◈→◆ sequence and hex-relay carries #-density, instead of
  // every motion wearing the same generic comet. The trail reuses the
  // motion's own past frames too, so each motion leaves its own wake.
  // ASCII terminals fall back to the clean box-drawing comet — motion
  // frames are a color-font feature.
  const headGlyph = (tick: number, distance: number) => {
    if (def && !ascii) return frameAt(def, Math.max(0, tick - distance), false);
    return distance === 0 ? head : trailGlyph(distance, ascii);
  };
  const trailDepth = def?.generator?.trail ?? 4;
  // Per-cell color gradient: hot head fading to dim through the palette.
  // Distance 0 = accent, then model → path → sep so the wake cools off.
  const cellColor = (distance: number): string => {
    if (!colorEnabled()) return "";
    if (distance <= 0) return hot;
    if (distance <= 1) return getFgAnsiCode("model");
    if (distance <= 2) return getFgAnsiCode("path");
    return dim;
  };
  let railBlock: string;
  if (!runtime.active) {
    // Idle: a frozen breathing wave of the ambient motion (wisp) frames.
    // No animation consumer at idle, but a sine-sampled wave reads as
    // "resting, not dead" — calmer than a full sweep, warmer than a flat track.
    const ambient = getMotion(defaultMotionFor("idle"));
    const ambientFrames = ambient ? framesOf(ambient) : null;
    if (ambientFrames && colorEnabled()) {
      const phase = Date.now() % 4000 / 4000;
      const built: string[] = [];
      for (let i = 0; i < RAIL_WIDTH; i++) {
        const wave = Math.sin((i / RAIL_WIDTH) * Math.PI * 2 + phase * Math.PI * 2);
        const frameIdx = Math.floor(((wave + 1) / 2) * ambientFrames.length) % ambientFrames.length;
        const color = wave > 0.3 ? hot : dim;
        built.push(`${color}${ambientFrames[frameIdx]}${reset}`);
      }
      railBlock = built.join("");
    } else {
      railBlock = track.repeat(RAIL_WIDTH);
    }
  } else if (runtime.activity === "compacting") {
    railBlock = renderCompactRail(runtime.tick, RAIL_WIDTH, ascii, headGlyph, cellColor);
  } else {
    const pos = sweepPosition(runtime.tick, RAIL_WIDTH, true);
    const built: string[] = [];
    for (let i = 0; i < RAIL_WIDTH; i++) {
      if (i === pos) built.push(`${cellColor(0)}${headGlyph(runtime.tick, 0)}${reset}`);
      else if (i < pos) {
        const distance = pos - i;
        built.push(`${cellColor(distance)}${headGlyph(runtime.tick, distance)}${reset}`);
      } else {
        built.push(track);
      }
    }
    railBlock = built.join("");
  }
  // Active state: 3-row lantern sigil ONLY for the streaming/working
  // activity. Each row is wrapped individually with the lane color
  // so rows 1+ don't inherit an empty ANSI state from row 0.
  if (runtime.active && !ascii && runtime.activity === "streaming") {
    const sigilRows = lanternSigil(runtime.tick, false);
    const [r0, ...rest] = sigilRows;
    const framed = `${spec.separators.left}${r0} ${label}${spec.separators.right}`;
    const allRows = [framed, ...rest];
    const colored = (row: string) => `${railColor}${row}${reset}`;
    // open brackets on the first row, close on the last row, color on
    // every row so the whole sigil reads as one amber block.
    const rows = allRows.map((row, i) => {
      const prefix = i === 0 ? open : "";
      const suffix = i === allRows.length - 1 ? close : "";
      return `${prefix}${colored(row)}${suffix}`;
    });
    railBlock = rows.join("\n");
    return railBlock;
  }
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
  headGlyph: (tick: number, i: number) => string,
  cellColor: (distance: number) => string,
): string {
  const half = Math.floor(width / 2);
  // Heads oscillate from the edges toward center and back.
  const span = half;
  const phase = tick % (span * 2);
  const inward = phase < span ? phase : span * 2 - phase;
  const leftPos = inward;
  const rightPos = width - 1 - inward;
  const core = ascii ? "=" : "━";
  const track = ascii ? "-" : "─";
  const reset = colorEnabled() ? ansi.reset : "";
  // Color the core by distance from the nearest head — hottest at the
  // heads, cooling toward center, so the compression reads thermally.
  let built = "";
  for (let i = 0; i < width; i++) {
    if (i === leftPos || i === rightPos) {
      built += `${cellColor(0)}${headGlyph(tick, 0)}${reset}`;
    } else if (i > leftPos && i < rightPos) {
      const nearestHead = Math.min(Math.abs(i - leftPos), Math.abs(i - rightPos));
      built += `${cellColor(nearestHead)}${core}${reset}`;
    } else {
      built += track;
    }
  }
  return built;
}