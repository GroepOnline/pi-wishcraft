/**
 * motion-candidates — tick-driven rail renderers (the autoresearch lab).
 * Each returns a single 12-col line, or a 3-line string when it spans
 * multiple rows (the layout's `height` + paint's row loop honour it).
 * Joep: "denk is aan wat OMP als intro heeft maar dan anders" — a
 * centered, breathing lantern sigil is the anders-than-OMP step.
 */

const W = 12;
const BRAILLE = ["⣀", "⣤", "⣶", "⣿"] as const;
const SHIMMER = ["▖", "▚", "▞", "▗"] as const;
const TRACK = "─";
const HEIGHT = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;

/** braille equalizer wave (kept for breadth; not wired). */
export function brailleWave(tick: number, ascii: boolean): string {
  if (ascii) return `~${"~".repeat(W - 2)}~`;
  let out = "";
  for (let i = 0; i < W; i++) {
    const phase = Math.sin((i - tick * 0.9) * 0.85);
    const amp = 0.5 + 0.5 * phase;
    out += BRAILLE[Math.min(3, Math.floor(amp * 4))] ?? "⣀";
  }
  return out;
}

/** headless shimmer (kept for breadth; not wired). */
export function shimmer(tick: number, ascii: boolean): string {
  if (ascii) return `~${"-".repeat(W - 2)}~`;
  const cells = Array.from({ length: W }, () => TRACK);
  for (let k = 0; k < 3; k++) {
    const h = ((tick * 7 + k * 13) * 2654435761) >>> 0;
    cells[h % W] = SHIMMER[(h >> 8) % 4] ?? "▚";
  }
  return cells.join("");
}

/** topographic fat-band (kept for breadth; not wired — sigil wins). */
export function fatBand(tick: number, ascii: boolean): string[] {
  if (ascii) return ["~~~~~~~~~~~~", "~~~~~~~~~~~~"];
  const row1: string[] = [];
  const row2: string[] = [];
  for (let i = 0; i < W; i++) {
    const phase = Math.sin((i - tick * 0.9) * 0.85);
    const amp = 0.5 + 0.5 * phase;
    const level = Math.min(7, Math.max(0, Math.round(amp * 7)));
    row1.push(HEIGHT[level] ?? "▁");
    row2.push(HEIGHT[7 - level] ?? "█");
  }
  return [row1.join(""), row2.join("")];
}

/** lantern sigil — 3-row animated identity, the OMP-intro step-up.
 * Centered braille-block lantern, sways and breathes. Lives in the
 * motion lab; motion-rail.ts wires it as the active-rail renderer.
 *   "    ⣀⣀    "
 *   "  ⣀⣤⣶⣿⣶⣤⣀  "
 *   "   ⣤⣶⣿⣶⣤   "
 * (left/right columns trimmed to 12 cols; breathing adds a denser row).
 */
const LANTERN_ROWS: readonly string[] = [
  "    ⣀⣀    ",
  "⣀⣤⣶⣿⣶⣤⣀",
  " ⣤⣶⣿⣶⣤ ",
];
const LANTERN_ROWS_BREATHE: readonly string[] = [
  "    ⣀⣀    ",
  "⣀⣶⣿⣿⣿⣶⣀",
  " ⣤⣶⣿⣶⣤ ",
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
export function lanternSigil(tick: number, ascii: boolean): string[] {
  if (ascii) {
    return [
      "    ####    ",
      "##O####O####",
      " ##O##O##  ",
    ];
  }
  const s = Math.round(Math.sin(tick * 0.3) * 1);
  const inhale = (tick % 8) < 5;
  const rows = inhale ? LANTERN_ROWS : LANTERN_ROWS_BREATHE;
  return rows.map((r) => center(sway(r, s)));
}