/**
 * autoresearch/extreme-motion candidates (the lab). Pure tick-driven
 * renderers, 12 cols, one glyph family each. Winner graduates into
 * motion-rail.
 */

const W = 12;
const BRAILLE_STEPS = ["⣀", "⣤", "⣶", "⣿"] as const;
const SHIMMER = ["▖", "▚", "▞", "▗"] as const;
const TRACK = "─";

/** B: braille equalizer wave traveling under the label. */
export function brailleWave(tick: number, ascii: boolean): string {
  if (ascii) return `~~${"~".repeat(W - 2)}`;
  let out = "";
  for (let i = 0; i < W; i++) {
    const phase = Math.sin((i - tick * 0.9) * 0.85);
    const amp = 0.5 + 0.5 * phase;
    out += BRAILLE_STEPS[Math.min(3, Math.floor(amp * 4))] ?? "⣀";
  }
  return out;
}

/** C: boids — head ● with two lagging followers of different latency. */
export function boids(tick: number, ascii: boolean): string {
  const span = W + 4;
  const phase = tick % (span * 2);
  const linear = phase < span ? phase : span * 2 - phase;
  const pos = Math.min(W - 1, Math.max(0, linear - 2));
  const lag1 = Math.min(W - 1, Math.max(0, pos - 2));
  const lag2 = Math.min(W - 1, Math.max(0, pos - 4));
  const cells: string[] = Array.from({ length: W }, () => (ascii ? "-" : TRACK));
  if (cells[lag2] === (ascii ? "-" : TRACK)) cells[lag2] = ascii ? "." : "·";
  if (cells[lag1] === (ascii ? "-" : TRACK)) cells[lag1] = ascii ? "+" : "▪";
  cells[pos] = ascii ? "*" : "●";
  return cells.join("");
}

/** D: chevron marquee — flow with density indicating pace. */
export function chevrons(tick: number, ascii: boolean): string {
  const cells: string[] = Array.from({ length: W }, () => (ascii ? "-" : TRACK));
  for (let k = 0; k < 3; k++) {
    const p = (((tick - k * 2) % W) + W) % W;
    cells[p] = ascii ? ">" : (k === 0 ? "▶" : k === 1 ? "‣" : "›");
  }
  return cells.join("");
}

/** E: shimmer — headless field, a few cells flip per tick (data-static). */
export function shimmer(tick: number, ascii: boolean): string {
  if (ascii) return `~${"-".repeat(W - 2)}~`;
  const cells = Array.from({ length: W }, () => TRACK);
  for (let k = 0; k < 3; k++) {
    // Deterministic pseudo-random from tick — no Math.random (pure renders).
    const h = ((tick * 7 + k * 13) * 2654435761) >>> 0;
    cells[h % W] = SHIMMER[(h >> 8) % 4] ?? "▚";
  }
  return cells.join("");
}

/** F: seismograph — spikes decay from event ticks (tick 0 = "event"). */
export function seismo(tick: number, ascii: boolean): string {
  const events = [0, 9, 17];
  let out = "";
  for (let i = 0; i < W; i++) {
    let level = 0;
    for (const e of events) {
      const d = tick - e - i;
      if (d >= 0 && d < 5) level = Math.max(level, 4 - d);
    }
    out += level === 0
      ? (ascii ? "_" : "▁")
      : (ascii ? "^".repeat(level) : "▁▂▄▆█"[level]);
  }
  return out;
}

/** G: fat-band — 2-row topographic waveform. Each cell fills to 1/8 height
 * (▁▂▃▄▅▆▇█) by wave amplitude; mirror row underneath creates a 2x
 * visual mass. Reads as a waveform image, not as a single bar.
 * Mass: 2 rows × 8 vertical levels ≈ 16x character presence vs the
 * single-row braille wave. Joep: "echt 11x zo dik".
 */
const HEIGHT = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
export function fatBand(tick: number, ascii: boolean): string[] {
  if (ascii) {
    return ["~~~~~~~~~~~~", "~~~~~~~~~~~~"];
  }
  const row1: string[] = [];
  const row2: string[] = [];
  for (let i = 0; i < W; i++) {
    const phase = Math.sin((i - tick * 0.9) * 0.85);
    const amp = (0.5 + 0.5 * phase); // 0..1
    const level = Math.min(7, Math.max(0, Math.round(amp * 7)));
    row1.push(HEIGHT[level] ?? "▁");
    row2.push(HEIGHT[7 - level] ?? "█");
  }
  return [row1.join(""), row2.join("")];
}

/** H: lantern sigil — 3-row animated identity (the OMP-intro step-up).
 * Centered braille-block lantern that breathes/sways; reads as a sigil,
 * not as a bar. Lives behind a layout PR that lets v2 segments declare
 * height so the sigil can sit above the prompt without breaking other
 * segments. Joep: "denk is aan wat OMP als intro heeft maar dan anders".
 */
const LANTERN = [
  "    ⣀⣀    ",
  "  ⣀⣤⣶⣿⣶⣤⣀  ",
  "   ⣤⣶⣿⣶⣤   ",
  "    ⣤⣶⣤    ",
];
function shift(s: string, n: number, w = 12): string {
  const padded = (n < 0 ? " ".repeat(-n) + s : s + " ".repeat(n));
  return padded.slice(0, w).padEnd(w, " ");
}
export function lanternSigil(tick: number, ascii: boolean): string[] {
  if (ascii) {
    return [
      "    ####    ",
      "  ##O####O##  ",
      "   ##O##O##   ",
      "    ##O##    ",
    ].map((r) => shift(r, 0));
  }
  const sway = Math.round(Math.sin(tick * 0.3) * 1.5);
  const breathe = (tick % 8) < 4 ? 0 : 1;
  const rows = LANTERN.map((r) => shift(r, sway));
  if (breathe) rows[1] = shift("  ⣀⣤⣶⣿⣿⣿⣶⣤⣀  ", sway);
  return rows;
}
