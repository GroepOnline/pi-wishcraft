/**
 * motion-candidates — tick-driven rail renderers (the autoresearch lab).
 * `lanternSigil` is the multi-row identity. `fat-band` is opt-in from the
 * status rail when the assigned motion id is `fat-band`. The other
 * candidates stay callable so the extreme-motion research is on main
 * without replacing the default one-row sweep.
 *
 * Joep: "denk is aan wat OMP als intro heeft maar dan anders" — a
 * centered, breathing lantern sigil is the anders-than-OMP step.
 */

const W = 12;

/** lantern sigil — 3-row animated identity, the OMP-intro step-up.
 * Centered `#`-block lantern, sways and breathes. No braille, no shade
 * blocks, no font assumptions — works on every terminal, every font.
 *   "    ##    "
 *   "  ######  "
 *   "   ####   "
 * (left/right columns trimmed to 12 cols; breathing adds a denser row).
 */
const LANTERN_ROWS: readonly string[] = [
  "    ##    ",
  "  ######  ",
  "   ####   ",
];
const LANTERN_ROWS_BREATHE: readonly string[] = [
  "    ##    ",
  " ####### ",
  "   ####   ",
];
function center(s: string, w = W): string {
  if (s.length === w) return s;
  if (s.length > w) return s.slice(0, w);
  const pad = Math.floor((w - s.length) / 2);
  return " ".repeat(pad) + s + " ".repeat(w - s.length - pad);
}
function sway(s: string, n: number): string {
  if (n === 0) return s;
  if (n > 0) return (" ".repeat(n) + s).slice(0, W).padEnd(W, " ");
  return (s + " ".repeat(-n)).slice(0, W).padEnd(W, " ");
}

const LAB_WIDTH = 12;
const BRAILLE_STEPS = ["⣀", "⣤", "⣶", "⣿"] as const;
const SHIMMER = ["▖", "▚", "▞", "▗"] as const;
const TRACK = "─";
const HEIGHT = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;

/** Braille equalizer wave. Fixed 12 columns. */
export function brailleWave(tick: number, ascii: boolean): string {
  if (ascii) return "~".repeat(LAB_WIDTH);
  let out = "";
  for (let i = 0; i < LAB_WIDTH; i++) {
    const phase = Math.sin((i - tick * 0.9) * 0.85);
    const amp = 0.5 + 0.5 * phase;
    out += BRAILLE_STEPS[Math.min(3, Math.floor(amp * 4))] ?? "⣀";
  }
  return out;
}

/** Head with two lagging followers. Fixed 12 columns. */
export function boids(tick: number, ascii: boolean): string {
  const span = LAB_WIDTH + 4;
  const phase = tick % (span * 2);
  const linear = phase < span ? phase : span * 2 - phase;
  const pos = Math.min(LAB_WIDTH - 1, Math.max(0, linear - 2));
  const lag1 = Math.min(LAB_WIDTH - 1, Math.max(0, pos - 2));
  const lag2 = Math.min(LAB_WIDTH - 1, Math.max(0, pos - 4));
  const track = ascii ? "-" : TRACK;
  const cells: string[] = Array.from({ length: LAB_WIDTH }, () => track);
  if (cells[lag2] === track) cells[lag2] = ascii ? "." : "·";
  if (cells[lag1] === track) cells[lag1] = ascii ? "+" : "▪";
  cells[pos] = ascii ? "*" : "●";
  return cells.join("");
}

/** Chevron marquee. Fixed 12 columns. */
export function chevrons(tick: number, ascii: boolean): string {
  const track = ascii ? "-" : TRACK;
  const cells: string[] = Array.from({ length: LAB_WIDTH }, () => track);
  for (let k = 0; k < 3; k++) {
    const p = (((tick - k * 2) % LAB_WIDTH) + LAB_WIDTH) % LAB_WIDTH;
    cells[p] = ascii ? ">" : k === 0 ? "▶" : k === 1 ? "‣" : "›";
  }
  return cells.join("");
}

/** Headless shimmer. Deterministic from tick. Fixed 12 columns. */
export function shimmer(tick: number, ascii: boolean): string {
  if (ascii) return `~${"-".repeat(LAB_WIDTH - 2)}~`;
  const cells = Array.from({ length: LAB_WIDTH }, () => TRACK);
  for (let k = 0; k < 3; k++) {
    const h = ((tick * 7 + k * 13) * 2654435761) >>> 0;
    cells[h % LAB_WIDTH] = SHIMMER[(h >> 8) % 4] ?? "▚";
  }
  return cells.join("");
}

/** Seismograph spikes. One cell per column, including ASCII. */
export function seismo(tick: number, ascii: boolean): string {
  const events = [0, 9, 17];
  let out = "";
  for (let i = 0; i < LAB_WIDTH; i++) {
    let level = 0;
    for (const event of events) {
      const distance = tick - event - i;
      if (distance >= 0 && distance < 5) level = Math.max(level, 4 - distance);
    }
    if (level === 0) out += ascii ? "_" : "▁";
    else out += ascii ? "^" : (HEIGHT[Math.min(level, HEIGHT.length - 1)] ?? "█");
  }
  return out;
}

/**
 * Two-row topographic waveform. The status rail uses the top row so the
 * footer stays one line. `width` follows the live rail; the lab default is 12.
 */
export function fatBand(tick: number, ascii: boolean, width = LAB_WIDTH): string[] {
  const columns = Math.max(1, Math.floor(width));
  if (ascii) {
    const row = "~".repeat(columns);
    return [row, row];
  }
  const row1: string[] = [];
  const row2: string[] = [];
  for (let i = 0; i < columns; i++) {
    const phase = Math.sin((i - tick * 0.9) * 0.85);
    const amp = 0.5 + 0.5 * phase;
    const level = Math.min(7, Math.max(0, Math.round(amp * 7)));
    row1.push(HEIGHT[level] ?? "▁");
    row2.push(HEIGHT[7 - level] ?? "█");
  }
  return [row1.join(""), row2.join("")];
}

export function lanternSigil(tick: number, _ascii: boolean): string[] {
  // Pure `#`-lantern — no braille, no shade blocks, no font
  // assumptions. Works on every terminal, every font. The lantern
  // identity comes from the shape, not the glyph set.
  const s = Math.round(Math.sin(tick * 0.3) * 1);
  const inhale = (tick % 8) < 5;
  const rows = inhale ? LANTERN_ROWS : LANTERN_ROWS_BREATHE;
  return rows.map((r) => center(sway(r, s)));
}
