import { visibleWidth } from "@earendil-works/pi-tui";

import type {
  SegmentContext,
  StatusLineSegmentId,
} from "../../config/types.ts";
import { renderSegment } from "../../segments/index.ts";
import { config } from "../core/state.ts";

// ═══════════════════════════════════════════════════════════════════════════
// Status Line Builder
// ═══════════════════════════════════════════════════════════════════════════

/** Render a single segment and return its content with width */
export function renderSegmentWithWidth(
  segId: StatusLineSegmentId,
  ctx: SegmentContext,
): { content: string; width: number; visible: boolean } {
  const rendered = renderSegment(segId, ctx);
  if (!rendered.visible || !rendered.content) {
    return { content: "", width: 0, visible: false };
  }
  return {
    content: rendered.content,
    width: visibleWidth(rendered.content),
    visible: true,
  };
}


// ═══════════════════════════════════════════════════════════════════════════
// Extension
// ═══════════════════════════════════════════════════════════════════════════

export function warnInvalidSegmentSettings(ctx: any): void {
  if (config.invalidDisabledSegments.length > 0) {
    const invalid = config.invalidDisabledSegments
      .map((id) => JSON.stringify(id))
      .join(", ");
    const message = `Ignoring unknown powerline disabled segment${config.invalidDisabledSegments.length === 1 ? "" : "s"}: ${invalid}`;
    console.warn(`[wishcraft] ${message}`);
    if (ctx.hasUI) ctx.ui.notify(message, "warning");
  }

  if (config.invalidLayoutSegments.length > 0) {
    const invalid = config.invalidLayoutSegments
      .map((id) => JSON.stringify(id))
      .join(", ");
    const message = `Ignoring unknown powerline layout segment${config.invalidLayoutSegments.length === 1 ? "" : "s"}: ${invalid}`;
    console.warn(`[wishcraft] ${message}`);
    if (ctx.hasUI) ctx.ui.notify(message, "warning");
  }

  if (config.invalidPlacement !== null) {
    const message = `Ignoring invalid powerline placement: ${JSON.stringify(config.invalidPlacement)}`;
    console.warn(`[wishcraft] ${message}`);
    if (ctx.hasUI) ctx.ui.notify(message, "warning");
  }
}
