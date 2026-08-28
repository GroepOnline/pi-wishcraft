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

const DEFAULT_HIDDEN_SENTINEL = "hidden";

function widthClassFor(width: number): WidthClass {
  if (width < 60) return "small";
  if (width < 120) return "medium";
  return "wide";
}

function isHidden(seg: LayoutSegment, config: LayoutConfig): boolean {
  if (seg.id === DEFAULT_HIDDEN_SENTINEL) return true;
  return !config.primary.includes(seg.id) && !config.secondary.includes(seg.id);
}

export function computeLaneLayout(
  segments: LayoutSegment[],
  width: number,
  config: LayoutConfig,
): LayoutResult {
  const visible: LayoutSegment[] = [];
  const dropped: LayoutSegment[] = [];
  for (const seg of segments) {
    if (isHidden(seg, config)) {
      dropped.push(seg);
      continue;
    }
    if (visibleWidth(seg.text) === 0) {
      dropped.push(seg);
      continue;
    }
    visible.push(seg);
  }
  visible.sort((a, b) => b.priority - a.priority);

  // Place by lane: primary first, then secondary if room.
  const cap = Math.max(0, width);
  const primary: LayoutSegment[] = [];
  const secondary: LayoutSegment[] = [];
  const placement: Array<{ seg: LayoutSegment; lane: "primary" | "secondary" }> = [];

  for (const seg of visible) {
    if (config.primary.includes(seg.id)) {
      placement.push({ seg, lane: "primary" });
    } else if (config.secondary.includes(seg.id)) {
      placement.push({ seg, lane: "secondary" });
    }
  }

  let used = 0;
  for (const { seg, lane } of placement) {
    const w = visibleWidth(seg.text);
    if (used + w > cap) {
      dropped.push(seg);
      continue;
    }
    if (lane === "primary") {
      primary.push(seg);
    } else {
      secondary.push(seg);
    }
    used += w + visibleWidth(config.separator);
  }

  // Honor the original primary order: callers expect model→context→git→queue.
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
