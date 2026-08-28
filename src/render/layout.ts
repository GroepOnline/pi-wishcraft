// Pure layout for the v2 powerline. No fs, no git, no theme reload.
// ponytail: this is a refactor target. The legacy getResponsiveLayout stays
// in place until U12 cutover; the v2 entry point is the only public surface
// for the new pipeline. Width classes follow the existing renderer
// (status-line-renderers.ts): small <60, medium <120, wide otherwise.

import { visibleWidth } from "@earendil-works/pi-tui";

export type WidthClass = "small" | "medium" | "wide";

export interface LayoutSegment {
  id: string;
  text: string;
  priority: number;
  /**
   * Optional visual height (rows). When > 1 the segment's `text` is split
   * on `\n` and rendered across that many rows; other segments on the same
   * lane pad empty rows below their content. The lane's rowCount is the
   * max height across its rendered segments, so a tall rail creates a
   * 3-row block beneath the rest of the line without disturbing their
   * own row(s).
   */
  height?: number;
}

export interface LayoutConfig {
  primary: string[];
  secondary: string[];
  separator: string;
  maxWidth: number;
}

export interface LayoutResult {
  primary: LayoutSegment[];
  secondary: LayoutSegment[];
  dropped: LayoutSegment[];
  widthClass: WidthClass;
  /** Max visual row count across rendered primary segments (>=1). */
  primaryRowCount: number;
  /** Max visual row count across rendered secondary segments (>=1). */
  secondaryRowCount: number;
}

function widthClassFor(width: number): WidthClass {
  if (width < 60) return "small";
  if (width < 120) return "medium";
  return "wide";
}

function segmentLineWidth(seg: LayoutSegment): number {
  let max = 0;
  for (const line of seg.text.split("\n")) {
    const w = visibleWidth(line);
    if (w > max) max = w;
  }
  return max;
}

function segmentHeight(seg: LayoutSegment): number {
  if (seg.height && seg.height > 1) return seg.height;
  // ponytail: derive from text so a 3-line rail without an explicit
  // height still renders as 3 rows. Trailing empty lines are noise from
  // upstream trims — don't promote them to extra rows.
  const nonEmpty = seg.text.split("\n").filter((line) => line.length > 0);
  return Math.max(1, nonEmpty.length);
}

function laneFor(seg: LayoutSegment, config: LayoutConfig): "primary" | "secondary" | null {
  if (config.primary.includes(seg.id)) return "primary";
  if (config.secondary.includes(seg.id)) return "secondary";
  return null;
}

export function computeLaneLayout(
  segments: LayoutSegment[],
  width: number,
  config: LayoutConfig,
): LayoutResult {
  const cap = Math.max(0, Math.min(width, config.maxWidth));
  const separatorWidth = visibleWidth(config.separator);
  const primary: LayoutSegment[] = [];
  const secondary: LayoutSegment[] = [];
  const dropped: LayoutSegment[] = [];
  // Sort by priority desc once; then assign by lane membership and width.
  const sorted = [...segments].sort((a, b) => b.priority - a.priority);
  let primaryUsed = 0;
  let secondaryUsed = 0;
  for (const seg of sorted) {
    const lane = laneFor(seg, config);
    if (lane === null) {
      dropped.push(seg);
      continue;
    }
    if (segmentLineWidth(seg) === 0) {
      dropped.push(seg);
      continue;
    }
    const w = segmentLineWidth(seg);
    // Each lane owns its own budget: a primary segment must not push a
    // secondary segment off the line. Separator width is charged only when
    // a segment follows another in the same lane.
    const used = lane === "primary" ? primaryUsed : secondaryUsed;
    const addedWidth = used === 0 ? w : separatorWidth + w;
    if (used + addedWidth > cap) {
      dropped.push(seg);
      continue;
    }
    (lane === "primary" ? primary : secondary).push(seg);
    if (lane === "primary") primaryUsed += addedWidth;
    else secondaryUsed += addedWidth;
  }

  // Honor the original primary/secondary order in the config so callers
  // expect model->context->git->queue rather than priority-sorted.
  const primaryOrder = new Map(config.primary.map((id, i) => [id, i]));
  primary.sort((a, b) => (primaryOrder.get(a.id) ?? 0) - (primaryOrder.get(b.id) ?? 0));
  const secondaryOrder = new Map(config.secondary.map((id, i) => [id, i]));
  secondary.sort((a, b) => (secondaryOrder.get(a.id) ?? 0) - (secondaryOrder.get(b.id) ?? 0));

  const primaryRowCount = primary.reduce(
    (m, s) => Math.max(m, segmentHeight(s)),
    1,
  );
  const secondaryRowCount = secondary.reduce(
    (m, s) => Math.max(m, segmentHeight(s)),
    1,
  );

  return {
    primary,
    secondary,
    dropped,
    widthClass: widthClassFor(width),
    primaryRowCount,
    secondaryRowCount,
  };
}
