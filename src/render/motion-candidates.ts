/**
 * motion-candidates — tick-driven rail renderers (the autoresearch lab).
 * Only `lanternSigil` is wired as the active streaming rail; the rest
 * were evaluated and discarded (see `.auto/log.jsonl`).
 *
 * Each returns a single 12-col line, or a 3-line string when it spans
 * multiple rows (the layout's `height` + paint's row loop honour it).
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

export function lanternSigil(tick: number, _ascii: boolean): string[] {
  // Pure `#`-lantern — no braille, no shade blocks, no font
  // assumptions. Works on every terminal, every font. The lantern
  // identity comes from the shape, not the glyph set.
  const s = Math.round(Math.sin(tick * 0.3) * 1);
  const inhale = (tick % 8) < 5;
  const rows = inhale ? LANTERN_ROWS : LANTERN_ROWS_BREATHE;
  return rows.map((r) => center(sway(r, s)));
}
