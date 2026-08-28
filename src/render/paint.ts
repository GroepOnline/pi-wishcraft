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
  primaryRowCount?: number;
  secondaryRowCount?: number;
}

const RESET = "\x1b[0m";

export function paintLane(lane: PaintedLane): string {
  return `${lane.bg}${lane.fg}${lane.text}${RESET}`;
}

export function paintLayout(layout: PaintedLayout, separator: string): string {
  const rows = layout.primaryRowCount ?? 1;
  const out: string[] = [];
  for (let r = 0; r < rows; r++) {
    const rowOut: string[] = [];
    for (let i = 0; i < layout.primary.length; i++) {
      if (i > 0 && r === 0) rowOut.push(separator);
      if (i > 0 && r > 0) rowOut.push(" ".repeat(separator.length));
      rowOut.push(paintLaneRow(layout.primary[i]!, r));
    }
    out.push(rowOut.join(""));
  }
  return out.join("\n");
}

export function paintSecondary(layout: PaintedLayout, separator: string): string {
  const rows = layout.secondaryRowCount ?? 1;
  const out: string[] = [];
  for (let r = 0; r < rows; r++) {
    const rowOut: string[] = [];
    for (let i = 0; i < layout.secondary.length; i++) {
      if (i > 0 && r === 0) rowOut.push(separator);
      if (i > 0 && r > 0) rowOut.push(" ".repeat(separator.length));
      rowOut.push(paintLaneRow(layout.secondary[i]!, r));
    }
    out.push(rowOut.join(""));
  }
  return out.join("\n");
}

function paintLaneRow(lane: PaintedLane, row: number): string {
  const lines = lane.text.split("\n");
  const line = lines[row] ?? "";
  return `${lane.bg}${lane.fg}${line}${RESET}`;
}
