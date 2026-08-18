import type {
  BuiltinStatusLineSegmentId,
  RenderedSegment,
  SegmentContext,
  StatusLineSegment,
  StatusLineSegmentId,
} from "../config/types.ts";
import {
  modelSegment,
  shellModeSegment,
  pathSegment,
  gitSegment,
  timeSpentSegment,
  timeSegment,
  sessionSegment,
  hostnameSegment,
} from "./core.ts";
import {
  tokenInSegment,
  tokenOutSegment,
  tokenTotalSegment,
  costSegment,
  contextPctSegment,
  contextTotalSegment,
  cacheReadSegment,
  cacheWriteSegment,
} from "./usage.ts";
import {
  thinkingSegment,
  subagentsSegment,
  queueSegment,
  extensionStatusesSegment,
  tpsSegment,
  openPortsSegment,
} from "./system.ts";
import {
  customComputedSegments,
  renderCustomSegment,
  isCustomSegmentId,
} from "./custom.ts";

// ═══════════════════════════════════════════════════════════════════════════
// Segment Registry
// ═══════════════════════════════════════════════════════════════════════════

export const SEGMENTS: Record<BuiltinStatusLineSegmentId, StatusLineSegment> = {
  model: modelSegment,
  shell_mode: shellModeSegment,
  path: pathSegment,
  git: gitSegment,
  thinking: thinkingSegment,
  subagents: subagentsSegment,
  queue: queueSegment,
  token_in: tokenInSegment,
  token_out: tokenOutSegment,
  token_total: tokenTotalSegment,
  cost: costSegment,
  context_pct: contextPctSegment,
  context_total: contextTotalSegment,
  time_spent: timeSpentSegment,
  time: timeSegment,
  session: sessionSegment,
  hostname: hostnameSegment,
  cache_read: cacheReadSegment,
  cache_write: cacheWriteSegment,
  tps: tpsSegment,
  open_ports: openPortsSegment,
  extension_statuses: extensionStatusesSegment,
};

export function renderSegment(
  id: StatusLineSegmentId,
  ctx: SegmentContext,
): RenderedSegment {
  if (isCustomSegmentId(id)) {
    const customId = id.slice("custom:".length);
    const computed = customComputedSegments.get(customId);
    if (computed) return applyLabelAndTemplate(id, computed.render(ctx), ctx);
    return applyLabelAndTemplate(id, renderCustomSegment(id, ctx), ctx);
  }

  const segment = SEGMENTS[id];
  if (!segment) {
    return { content: "", visible: false };
  }
  return applyLabelAndTemplate(id, segment.render(ctx), ctx);
}

const ANSI_RE = /\x1b\[[0-9;]*m/g;

/** Centrale label + template-afhandeling voor álle segments.
 * Template (segmentOptions.<seg>.template) wint op het label; `{value}`
 * wordt vervangen door de kale (ANSI-vrije) segmenttekst. */
function applyLabelAndTemplate(
  id: string,
  rendered: RenderedSegment,
  ctx: SegmentContext,
): RenderedSegment {
  if (!rendered.visible || !rendered.content) return rendered;
  const template = (
    (ctx.options as Record<string, { template?: string } | undefined>)?.[id]
      ?.template
  )?.trim();
  if (template) {
    const plain = rendered.content.replace(ANSI_RE, "");
    return {
      ...rendered,
      content: template.includes("{value}")
        ? template.replace("{value}", plain)
        : template,
    };
  }
  const label = ctx.segmentLabels?.get(id);
  if (label) {
    return { ...rendered, content: `${label} ${rendered.content}` };
  }
  return rendered;
}
