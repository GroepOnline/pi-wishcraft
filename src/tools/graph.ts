const BRAILLE_CHAR_BASE = 0x2800;

// Braille dot heights (0-7 for 4 vertical levels in 2 columns)
const BRAILLE_MAP = [0x40, 0x4, 0x20, 0x2, 0x10, 0x1, 0x80, 0x8];

/**
 * Render a sequence of numeric data points as a Braille sparkline string.
 */
export function renderSparkline(values: number[], width: number = 20): string {
  if (values.length === 0) return " ".repeat(width);

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  // Normalize values to 0..3 range (4 height levels)
  const normalized = values.map((v) => Math.min(3, Math.floor(((v - min) / range) * 3.99)));

  // Group into pairs for Braille columns (2 values per Braille character)
  let sparkline = "";
  const numChars = Math.min(width, Math.ceil(normalized.length / 2));

  for (let i = 0; i < numChars * 2; i += 2) {
    const leftVal = normalized[i] ?? 0;
    const rightVal = normalized[i + 1] ?? leftVal;

    // Map 0..3 height to Braille dots
    let charCode = BRAILLE_CHAR_BASE;
    if (leftVal >= 1) charCode |= 0x40; // dot 7
    if (leftVal >= 2) charCode |= 0x04; // dot 3
    if (leftVal >= 3) charCode |= 0x01; // dot 1

    if (rightVal >= 1) charCode |= 0x80; // dot 8
    if (rightVal >= 2) charCode |= 0x20; // dot 6
    if (rightVal >= 3) charCode |= 0x02; // dot 2

    sparkline += String.fromCharCode(charCode);
  }

  return sparkline;
}

export interface GraphNode {
  id: string;
  label: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  label?: string;
}

/**
 * Render a simple ASCII graph representation of dependency nodes and edges.
 */
export function renderAsciiGraph(nodes: GraphNode[], edges: GraphEdge[]): string[] {
  const lines: string[] = [];

  for (const node of nodes) {
    lines.push(` ┌──────────────┐`);
    lines.push(` │ ${node.label.padEnd(12)} │`);
    lines.push(` └──────────────┘`);

    const outEdges = edges.filter((e) => e.from === node.id);
    for (const edge of outEdges) {
      const target = nodes.find((n) => n.id === edge.to);
      if (target) {
        lines.push(`        │ ${edge.label ? `[${edge.label}]` : "-->"} ${target.label}`);
      }
    }
  }

  return lines;
}
