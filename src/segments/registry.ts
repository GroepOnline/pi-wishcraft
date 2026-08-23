import type {
  BuiltinStatusLineSegmentId,
  RenderedSegment,
  SegmentContext,
  StatusLineSegment,
  StatusLineSegmentId,
} from "../config/types.ts";
import { getIcons } from "../theme/icons.ts";
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

// ═══════════════════════════════════════════════════════════════════════════
// Segment decoration (labels + templates)
//
// `powerline.segmentLabels.<id>` inserts a label between the icon and the
// value for ANY segment; `segmentOptions.<id>.template` replaces the value
// text ("{value}" is substituted). Both are applied centrally here so every
// segment honors them uniformly (previously only tps/open_ports did).
// ═══════════════════════════════════════════════════════════════════════════

const ANSI_ESCAPE_RE = /\x1b\[[0-9;]*m/g;

function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE_RE, "");
}

/** Index of the first visible (non-escape) character in a rendered string. */
function firstVisibleCharIndex(content: string): number {
  for (let i = 0; i < content.length; i++) {
    if (content[i] === "\x1b") {
      const match = ANSI_ESCAPE_RE.exec(content.slice(i));
      if (match) {
        i += match[0].length - 1;
        continue;
      }
    }
    return i;
  }
  return content.length;
}

function leadingIconAndValue(
  visible: string,
): { icon: string; value: string } {
  const trimmed = visible.trimStart();
  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex <= 0) return { icon: "", value: trimmed };

  const candidate = trimmed.slice(0, spaceIndex);
  const icons = getIcons();
  const iconValues = new Set(
    Object.values(icons).filter((icon) => icon.length > 0),
  );
  if (!iconValues.has(candidate)) return { icon: "", value: trimmed };
  return { icon: candidate, value: trimmed.slice(spaceIndex + 1).trimStart() };
}

/**
 * Apply `segmentLabels` (label between icon and value) and
 * `segmentOptions.<id>.template` ({value} substitution) to a rendered
 * segment. Label-only insertion preserves the original ANSI styling spans;
 * templates rebuild the content with the segment's leading style.
 */
export function applySegmentDecoration(
  id: StatusLineSegmentId,
  ctx: SegmentContext,
  rendered: RenderedSegment,
): RenderedSegment {
  const label = ctx.segmentLabels?.get(id);
  const optionsForId = (
    ctx.options as Record<string, { template?: string } | undefined> | undefined
  )?.[id];
  const template = optionsForId?.template;
  if (!label && !template) return rendered;
  if (!rendered.visible || !rendered.content) return rendered;

  const visible = stripAnsi(rendered.content);
  const { icon, value } = leadingIconAndValue(visible);
  const firstVisibleIndex = firstVisibleCharIndex(rendered.content);
  const styledPrefix = rendered.content.slice(0, firstVisibleIndex);

  if (!template) {
    // Label-only: pure insertion right after the icon, so every inner ANSI
    // span of the original content is preserved untouched.
    let insertAt = firstVisibleIndex + icon.length;
    if (rendered.content[insertAt] === " ") insertAt += 1;
    return {
      content:
        rendered.content.slice(0, insertAt) +
        `${label} ` +
        rendered.content.slice(insertAt),
      visible: true,
    };
  }

  // Template (with optional label): rebuild with the segment's leading style.
  let newValue = template.replaceAll("{value}", value);
  if (label) newValue = `${label} ${newValue}`;
  const content = `${styledPrefix}${icon ? `${icon} ` : ""}${newValue}${rendered.content.endsWith("\x1b[0m") ? "\x1b[0m" : ""}`;
  return { content, visible: true };
}

const SEGMENT_ERROR_LOG_INTERVAL_MS = 10_000;
const lastSegmentErrorLog = new Map<StatusLineSegmentId, number>();

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
  try {
    let rendered: RenderedSegment;
    if (isCustomSegmentId(id)) {
      const customId = id.slice("custom:".length);
      const computed = customComputedSegments.get(customId);
      rendered = computed
        ? computed.render(ctx)
        : renderCustomSegment(id, ctx);
    } else {
      const segment = SEGMENTS[id];
      rendered = segment ? segment.render(ctx) : { content: "", visible: false };
    }
    return applySegmentDecoration(id, ctx, rendered);
  } catch (err) {
    // Per-segment fault isolation: keep the footer alive and identify the
    // segment that failed. Log at most once every 10 seconds per segment.
    const now = Date.now();
    const lastLogged = lastSegmentErrorLog.get(id) ?? 0;
    if (now - lastLogged >= SEGMENT_ERROR_LOG_INTERVAL_MS) {
      lastSegmentErrorLog.set(id, now);
      const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
      console.warn(`[wishcraft] segment "${id}" failed: ${detail}`);
    }
    return applySegmentDecoration(id, ctx, {
      content: `!${id}`,
      visible: true,
    });

  }
}
