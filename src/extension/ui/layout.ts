import { visibleWidth } from "@earendil-works/pi-tui";

import type {
  SegmentContext,
  StatusLineSegmentId,
  StatusLineSeparatorStyle,
} from "../../config/types.ts";
import { getPreset } from "../../config/presets.ts";
import { mergeSegmentsWithCustomItems } from "../../config/powerline-config.ts";
import { getSeparator } from "../../theme/separators.ts";
import { renderSegment } from "../../segments/index.ts";
import { ansi, colorEnabled, getFgAnsiCode } from "../../theme/colors.ts";
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

/** Build content string from pre-rendered parts */
export function buildContentFromParts(
  parts: string[],
  separatorStyle: StatusLineSeparatorStyle,
): string {
  if (parts.length === 0) return "";
  const separatorDef = getSeparator(separatorStyle);
  const sepAnsi = getFgAnsiCode("sep");
  const sep = separatorDef.left;
  const reset = colorEnabled() ? ansi.reset : "";
  return " " + parts.join(` ${sepAnsi}${sep}${reset} `) + reset + " ";
}

/**
 * Responsive segment layout - fits segments into top bar, overflows to secondary row.
 * When terminal is wide enough, secondary segments move up to top bar.
 * When narrow, top bar segments overflow down to secondary row.
 */
export function computeResponsiveLayout(
  ctx: SegmentContext,
  presetDef: ReturnType<typeof getPreset>,
  availableWidth: number,
): { topContent: string; secondaryContent: string } {
  const separatorStyle = config.separator ?? presetDef.separator;
  const separatorDef = getSeparator(separatorStyle);
  const sepWidth = visibleWidth(separatorDef.left) + 2; // separator + spaces around it

  // Get all segments: primary first, then secondary
  const mergedSegments = mergeSegmentsWithCustomItems(
    presetDef,
    ctx.effectiveCustomItems,
    {
      layout: config.layout,
      disabledSegments: config.disabledSegments,
    },
  );
  const primaryIds = [
    ...mergedSegments.leftSegments,
    ...mergedSegments.rightSegments,
  ];
  const secondaryIds = mergedSegments.secondarySegments;
  const allSegmentIds = [...primaryIds, ...secondaryIds];

  // Render all segments and get their widths
  const renderedSegments: { content: string; width: number }[] = [];
  for (const segId of allSegmentIds) {
    const { content, width, visible } = renderSegmentWithWidth(segId, ctx);
    if (visible) {
      renderedSegments.push({ content, width });
    }
  }

  if (renderedSegments.length === 0) {
    return { topContent: "", secondaryContent: "" };
  }

  // Calculate how many segments fit in top bar
  // Account for: leading space (1) + trailing space (1) = 2 chars overhead
  const baseOverhead = 2;
  let currentWidth = baseOverhead;
  let topSegments: string[] = [];
  let overflowSegments: { content: string; width: number }[] = [];
  let overflow = false;

  for (const seg of renderedSegments) {
    const neededWidth = seg.width + (topSegments.length > 0 ? sepWidth : 0);

    if (!overflow && currentWidth + neededWidth <= availableWidth) {
      topSegments.push(seg.content);
      currentWidth += neededWidth;
    } else {
      overflow = true;
      overflowSegments.push(seg);
    }
  }

  // Fit overflow segments into secondary row (same width constraint)
  // Stop at first non-fitting segment to preserve ordering
  let secondaryWidth = baseOverhead;
  let secondarySegments: string[] = [];

  for (const seg of overflowSegments) {
    const neededWidth =
      seg.width + (secondarySegments.length > 0 ? sepWidth : 0);
    if (secondaryWidth + neededWidth <= availableWidth) {
      secondarySegments.push(seg.content);
      secondaryWidth += neededWidth;
    } else {
      break;
    }
  }

  return {
    topContent: buildContentFromParts(topSegments, separatorStyle),
    secondaryContent: buildContentFromParts(secondarySegments, separatorStyle),
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
