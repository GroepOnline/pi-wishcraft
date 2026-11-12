/**
 * v2 status-line entry (U12 cutover). Composes the single render path:
 * segments render through the per-segment fault-isolated `renderSegment`
 * boundary, the motion rail renders as a first-class layout segment, and
 * lanes flow through `computeLaneLayout` + `paintLayout`. The legacy v1
 * three-lane renderer (src/signal/render.ts) is deleted; rail semantics
 * live on in ./motion-rail.ts.
 *
 * Priority scheme preserves the v1 reading order left -> rail -> right:
 * left segments 10_000-i, rail 5_000, right segments 1_000-i. Under width
 * pressure computeLaneLayout drops the lowest priorities first, so the
 * right lane yields before the rail, and the rail before the left —
 * matching v1's "preserve model/git first, then context/queue" squeeze.
 */

import type {
  PresetDef,
  SegmentContext,
  SignalSpec,
  StatusLineLayout,
  StatusLineSegmentId,
  StatusLineSeparatorStyle,
} from "../config/types.ts";
import { mergeSegmentsWithCustomItems } from "../config/powerline-config.ts";
import { renderSegment } from "../segments/index.ts";
import { getContributedSignalSources } from "../extension/contrib/registry.ts";
import { getSeparator } from "../theme/separators.ts";
import { ansi, colorEnabled, getFgAnsiCode } from "../theme/colors.ts";
import { renderActivity } from "./motion-rail.ts";
import { renderPowerlineV2, type V2Segment } from "./v2-adapter.ts";
import type { SignalRuntime } from "../signal/controller.ts";

export interface StatusLineV2Options {
  separatorStyle: StatusLineSeparatorStyle;
  signal: SignalSpec;
  ascii?: boolean;
  layout?: StatusLineLayout | null;
  disabledSegments?: StatusLineSegmentId[];
}

const ANSI_CONTROL_RE =
  /\x1B(?:\][^\x07]*(?:\u0007|\x1B\\)|\[[0-?]*[ -/]*[@-~]|[@-_])|\x9B[0-?]*[ -/]*[@-~]|\x9D[^\x07]*(?:\u0007|\x1B\\)/g;

function contributedTexts(ctx: SegmentContext): string[] {
  const out: string[] = [];
  for (const src of getContributedSignalSources()) {
    try {
      const raw = src.render?.(ctx);
      if (!raw || typeof raw !== "string") continue;
      const content = raw.trim();
      if (!content.replace(ANSI_CONTROL_RE, "").trim()) continue;
      // ponytail: fault-isolated — a throwing or empty source never takes the line down
      out.push(content);
    } catch {
      // skip failing contribution
    }
  }
  return out;
}

function styledSeparator(separator: string): string {
  const color = getFgAnsiCode("sep");
  const reset = colorEnabled() ? ansi.reset : "";
  return ` ${color}${separator}${reset} `;
}

export interface StatusLineParts {
  segments: V2Segment[];
  primary: string[];
  secondary: string[];
}

/**
 * Segment side of the status line — everything except the motion rail.
 * Cached by the renderer between painted frames so a rail-only tick can
 * recompose without re-running every segment renderer.
 */
export function buildStatusLineParts(
  ctx: SegmentContext,
  preset: PresetDef,
  options: StatusLineV2Options,
): StatusLineParts {
  const merged = mergeSegmentsWithCustomItems(
    preset,
    ctx.effectiveCustomItems,
    {
      layout: options.layout ?? null,
      disabledSegments: options.disabledSegments ?? [],
    },
  );

  const segments: V2Segment[] = [];
  const primary: string[] = [];

  const pushSegment = (id: StatusLineSegmentId, priority: number): void => {
    try {
      const rendered = renderSegment(id, ctx);
      if (!rendered.visible || !rendered.content) return;
      segments.push({ id, text: rendered.content, priority });
      primary.push(id);
    } catch {
      // renderSegment is the established per-segment error boundary; a
      // throwing segment never blanks the line.
    }
  };

  merged.leftSegments.forEach((id, i) => pushSegment(id, 10_000 - i));

  // Slot for the motion rail — composeStatusLine fills it with the live text.
  segments.push({ id: "signal", text: "", priority: 5_000 });
  primary.push("signal");

  merged.rightSegments.forEach((id, i) => pushSegment(id, 1_000 - i));
  contributedTexts(ctx).forEach((text, i) => {
    const id = `contrib:${i}`;
    segments.push({ id, text, priority: 900 - i });
    primary.push(id);
  });

  const secondary: string[] = [];
  merged.secondarySegments.forEach((id, i) => {
    try {
      const rendered = renderSegment(id, ctx);
      if (!rendered.visible || !rendered.content) return;
      segments.push({ id, text: rendered.content, priority: 500 - i });
      secondary.push(id);
    } catch {
      // Keep secondary segments behind the same fault boundary as primary.
    }
  });

  return { segments, primary, secondary };
}

/** Pure assembly: cached parts + fresh rail text → painted strings. */
export function composeStatusLine(
  parts: StatusLineParts,
  rail: string,
  width: number,
  options: StatusLineV2Options,
): { topContent: string; secondaryContent: string } {
  const segments = parts.segments.map((seg) =>
    seg.id === "signal" ? { ...seg, text: rail } : seg,
  );
  const separatorGlyph = getSeparator(options.separatorStyle).left;
  return renderPowerlineV2(segments, width, {
    primary: parts.primary,
    secondary: parts.secondary,
    separator: styledSeparator(separatorGlyph),
  });
}

export function renderStatusLineV2(
  ctx: SegmentContext,
  preset: PresetDef,
  runtime: SignalRuntime,
  width: number,
  options: StatusLineV2Options,
): { topContent: string; secondaryContent: string } {
  const parts = buildStatusLineParts(ctx, preset, options);
  const rail = renderActivity(runtime, options.signal, options.ascii, width);
  return composeStatusLine(parts, rail, width, options);
}
