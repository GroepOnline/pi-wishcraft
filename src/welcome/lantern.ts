/**
 * lantern.ts
 * ---------------------------------------------------------------------------
 * Renderer voor de wensballon (lantern-art.ts). Rendert het pixelgrid met
 * half-blocks: bovenste helft = fg-kleur, onderste = bg-kleur, twee
 * pixelrijen per terminal-rij. De vlam flikkert subtiel: helderheid
 * moduleert met een trage adem en een snelle rimpel, als een lantaarn
 * in de wind.
 * ---------------------------------------------------------------------------
 */

import { LANTERN_ROWS } from "./lantern-art.ts";

export interface LanternFrame {
  /** Tijdbron voor de animatiefase; Date.now() volstaat. */
  now: number;
  /** true = statisch (geen flikker), voor header-mode. */
  still?: boolean;
}

const GLOW_BASE = 1.0;
const GLOW_AMP = 0.14;

interface Cell {
  r: number;
  g: number;
  b: number;
}

const GRID: Array<Array<Cell | null>> = LANTERN_ROWS.map((row) =>
  row.split("|").map((c) => {
    if (c === "-") return null;
    const [r, g, b] = c.split(",").map(Number);
    return { r: r!, g: g!, b: b! };
  }),
);

const WIDTH = GRID[0]?.length ?? 0;

function fg(cell: Cell, f: number): string {
  return `\x1b[38;2;${Math.min(255, Math.round(cell.r * f))};${Math.min(255, Math.round(cell.g * f))};${Math.min(255, Math.round(cell.b * f))}m`;
}

function bg(cell: Cell, f: number): string {
  return `\x1b[48;2;${Math.min(255, Math.round(cell.r * f))};${Math.min(255, Math.round(cell.g * f))};${Math.min(255, Math.round(cell.b * f))}m`;
}

/**
 * Rendert de ballon als terminal-regels (half-blocks). Geeft lege regels
 * terug als de terminal te smal is.
 */
export function renderLantern(frame: LanternFrame, maxWidth: number): string[] {
  if (WIDTH === 0 || WIDTH > maxWidth) return [];

  const t = frame.now / 1000;
  const breathe = Math.sin(t * 1.1) * 0.5 + 0.5;
  const ripple = Math.sin(t * 7.3) * 0.5 + 0.5;
  const f = frame.still
    ? GLOW_BASE
    : GLOW_BASE + GLOW_AMP * (0.55 * breathe + 0.45 * ripple - 0.5);

  const lines: string[] = [];
  for (let y = 0; y < GRID.length; y += 2) {
    const upper = GRID[y] ?? [];
    const lower = GRID[y + 1] ?? [];
    let line = "";
    for (let x = 0; x < WIDTH; x++) {
      const up = upper[x] ?? null;
      const lo = lower[x] ?? null;
      if (!up && !lo) {
        line += " ";
      } else if (up && lo) {
        line += `${fg(up, f)}${bg(lo, f)}▀\x1b[0m`;
      } else if (up) {
        line += `${fg(up, f)}▀\x1b[0m`;
      } else {
        line += `\x1b[38;2;0;0;0m${bg(lo!, f)}▀\x1b[0m`;
      }
    }
    lines.push(line);
  }
  return lines;
}

export const LANTERN_WIDTH = WIDTH;
export const LANTERN_HEIGHT = Math.ceil(GRID.length / 2);
