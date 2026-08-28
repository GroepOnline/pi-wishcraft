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
}

function widthClassFor(width: number): WidthClass {
  if (width < 60) return "small";
  if (width < 120) return "medium";
  return "wide";
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
  const cap = Math.max(0, width);
  const primary: LayoutSegment[] = [];
  const secondary: LayoutSegment[] = [];
  const dropped: LayoutSegment[] = [];
  // Sort by priority desc once; then assign by lane membership and width.
  const sorted = [...segments].sort((a, b) => b.priority - a.priority);
  let used = 0;
  for (const seg of sorted) {
    const lane = laneFor(seg, config);
    if (lane === null) {
      dropped.push(seg);
      continue;
    }
    if (visibleWidth(seg.text) === 0) {
      dropped.push(seg);
      continue;
    }
    const w = visibleWidth(seg.text);
    if (used + w > cap) {
      dropped.push(seg);
      continue;
    }
    (lane === "primary" ? primary : secondary).push(seg);
    used += w + visibleWidth(config.separator);
  }

  // Honor the original primary/secondary order in the config so callers
  // expect model->context->git->queue rather than priority-sorted.
  const primaryOrder = new Map(config.primary.map((id, i) => [id, i]));
  primary.sort((a, b) => (primaryOrder.get(a.id) ?? 0) - (primaryOrder.get(b.id) ?? 0));
  const secondaryOrder = new Map(config.secondary.map((id, i) => [id, i]));
  secondary.sort((a, b) => (secondaryOrder.get(a.id) ?? 0) - (secondaryOrder.get(b.id) ?? 0));

  return {
    primary,
    secondary,
    dropped,
    widthClass: widthClassFor(width),
  };
}
