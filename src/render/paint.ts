// Cheap paint assembly. Consumes a layout and produces terminal-ready
// strings. No fs, no git, no theme reload — those are upstream of layout.

export interface PaintedLane {
  id: string;
  text: string;
  bg: string;
  fg: string;
}

export interface PaintedLayout {
  primary: PaintedLane[];
  secondary: PaintedLane[];
  dropped: PaintedLane[];
  widthClass: "small" | "medium" | "wide";
}

const RESET = "\x1b[0m";

export function paintLane(lane: PaintedLane): string {
  return `${lane.bg}${lane.fg}${lane.text}${RESET}`;
}

export function paintLayout(layout: PaintedLayout, separator: string): string {
  const out: string[] = [];
  for (let i = 0; i < layout.primary.length; i++) {
    if (i > 0) out.push(separator);
    out.push(paintLane(layout.primary[i]!));
  }
  return out.join("");
}

export function paintSecondary(layout: PaintedLayout, separator: string): string {
  const out: string[] = [];
  for (let i = 0; i < layout.secondary.length; i++) {
    if (i > 0) out.push(separator);
    out.push(paintLane(layout.secondary[i]!));
  }
  return out.join("");
}
