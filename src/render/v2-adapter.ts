// v2 render adapter: wires the pure layout + paint into a top/secondary
// string pair matching the shape that status-line-renderers.ts consumers
// (renderPowerlinePrimaryLines / renderPowerlineSecondaryLines) already
// expect. This is the U12 cutover entry point. v1 paths remain in place
// until a follow-up PR deletes them after live-golden verification.
//
// ponytail: this is a delegating adapter, not a replacement. The
// status-line-renderers.ts consumers stay on v1 until v2 is exercised
// against real presets; the adapter exists so consumers can opt in via a
// single import swap once that is done.

import { computeLaneLayout, type LayoutSegment, type WidthClass } from "./layout.ts";
import { paintLayout, paintSecondary, type PaintedLane } from "./paint.ts";

export interface V2Segment extends LayoutSegment {}

export interface V2LaneConfig {
  primary: string[];
  secondary: string[];
}

export interface V2RenderResult {
  topContent: string;
  secondaryContent: string;
  dropped: LayoutSegment[];
  widthClass: WidthClass;
}

const SEPARATOR = " | ";

function toPainted(seg: LayoutSegment): PaintedLane {
  return {
    id: seg.id,
    text: seg.text,
    bg: "",
    fg: "",
  };
}

export function renderPowerlineV2(
  segments: V2Segment[],
  width: number,
  config: V2LaneConfig,
): V2RenderResult {
  const layout = computeLaneLayout(segments, width, {
    primary: config.primary,
    secondary: config.secondary,
    separator: SEPARATOR,
    maxWidth: width,
  });

  const painted = {
    primary: layout.primary.map(toPainted),
    secondary: layout.secondary.map(toPainted),
    dropped: [] as PaintedLane[],
    widthClass: layout.widthClass,
  };

  return {
    topContent: paintLayout(painted, SEPARATOR),
    secondaryContent: paintSecondary(painted, SEPARATOR),
    dropped: layout.dropped,
    widthClass: layout.widthClass,
  };
}
