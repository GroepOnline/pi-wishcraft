/**
 * src/extension/ui/signal-layout.ts
 * ---------------------------------------------------------------------------
 * 3-Lane Motion-Aware Signal Powerline Renderer.
 * Left: Model / Git · Center: Live Activity & Tools · Right: Context / Queue
 * ---------------------------------------------------------------------------
 */

import { visibleWidth } from "@earendil-works/pi-tui";
import type { PresetDef, SegmentContext } from "../../config/types.ts";
import { renderSegmentWithWidth } from "./layout.ts";
import { getSeparator } from "../../theme/separators.ts";
import { ansi, colorEnabled, getFgAnsiCode } from "../../theme/colors.ts";
import { getGlobalMotionScheduler } from "../../motion/scheduler.ts";

export interface SignalRenderResult {
  content: string;
  leftLaneContent: string;
  centerLaneContent: string;
  rightLaneContent: string;
}

/**
 * Computes the 3-lane Signal powerline with active motion sweeps.
 */
export function computeSignal3LaneLayout(
  ctx: SegmentContext,
  presetDef: PresetDef,
  availableWidth: number,
  motionGlyph: string = "✦",
): SignalRenderResult {
  const separatorStyle = presetDef.separator ?? "powerline-thin";
  const sepDef = getSeparator(separatorStyle);
  const sep = sepDef.left;
  const sepAnsi = getFgAnsiCode("sep");
  const reset = colorEnabled() ? ansi.reset : "";

  // 1. Left Lane: Identity (model, git, path)
  const leftIds = presetDef.signal?.leftLane ?? ["model", "path", "git"];
  const leftParts: string[] = [];
  for (const id of leftIds) {
    const { content, visible } = renderSegmentWithWidth(id, ctx);
    if (visible && content) leftParts.push(content);
  }

  // 2. Center Lane: Live Activity & Motion Conduit
  const centerIds = presetDef.signal?.centerLane ?? ["thinking", "shell_mode", "subagents"];
  const centerParts: string[] = [];
  for (const id of centerIds) {
    const { content, visible } = renderSegmentWithWidth(id, ctx);
    if (visible && content) centerParts.push(content);
  }

  // 3. Right Lane: Metrics & Context (context_pct, queue, cost, tps)
  const rightIds = presetDef.signal?.rightLane ?? ["cost", "context_pct", "queue"];
  const rightParts: string[] = [];
  for (const id of rightIds) {
    const { content, visible } = renderSegmentWithWidth(id, ctx);
    if (visible && content) rightParts.push(content);
  }

  const leftText = leftParts.join(` ${sepAnsi}${sep}${reset} `);
  const rightText = rightParts.join(` ${sepAnsi}${sep}${reset} `);

  // Dynamic conduit sweep pulse in center lane
  const centerText = centerParts.length > 0
    ? `━━━╾${motionGlyph}╼━━━ ${centerParts.join(" ")}`
    : `━━━╾${motionGlyph}╼━━━`;

  const fullLine = ` ${leftText} ${sepAnsi}${sep}${reset} ${centerText} ${sepAnsi}${sep}${reset} ${rightText} `;

  return {
    content: fullLine,
    leftLaneContent: leftText,
    centerLaneContent: centerText,
    rightLaneContent: rightText,
  };
}
