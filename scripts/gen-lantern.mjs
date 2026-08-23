// ANSI-art → doubled pixel grid → downscale → embedded TS module
import { readFileSync, writeFileSync } from "node:fs";
const raw = readFileSync(process.env.HOME + "/.config/fastfetch/logo.ans", "utf8");
const lines = raw.split("\n").filter(l => l.includes("\x1b["));

// 1) parse naar pixel grid (2 rijen per tekst-rij)
const pixels = []; // rijen van "r,g,b" | null
for (const line of lines) {
  const upper = [], lower = [];
  let fg = null, bg = null, pos = 0;
  const re = /\x1b\[([0-9;]*)m/g;
  let m;
  const consume = (text) => {
    for (const ch of text) {
      if (ch === "▀") { upper.push(fg); lower.push(bg); }
      else if (ch === "▄") { upper.push(bg); lower.push(fg); }
      else if (ch === "█") { upper.push(fg); lower.push(fg); }
      else if (ch === " ") { upper.push(bg); lower.push(null); }
      else { upper.push(null); lower.push(null); }
    }
  };
  while ((m = re.exec(line))) {
    consume(line.slice(pos, m.index));
    pos = m.index + m[0].length;
    const codes = m[1].split(";").map(Number);
    for (let i = 0; i < codes.length; i++) {
      if (codes[i] === 38 && codes[i+1] === 2) { fg = codes.slice(i+2, i+5).join(","); i += 4; }
      else if (codes[i] === 48 && codes[i+1] === 2) { bg = codes.slice(i+2, i+5).join(","); i += 4; }
      else if (codes[i] === 0 || codes[i] === 39) { fg = null; }
      else if (codes[i] === 49) { bg = null; }
    }
  }
  consume(line.slice(pos));
  pixels.push(upper, lower);
}
const H = pixels.length, W = Math.max(...pixels.map(r => r.length));

// 2) crop lege kolommen
let minX = W, maxX = 0;
pixels.forEach(r => r.forEach((c, x) => { if (c) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); } }));
const cropW = maxX - minX + 1;
const crop = pixels.map(r => r.slice(minX, maxX + 1));
while (crop.length && crop[0].every(c => !c)) crop.shift();
while (crop.length && crop[crop.length-1].every(c => !c)) crop.pop();
const ch = crop.length, cw = crop[0].length;

// 3) downscale met box-sampling: target ~24 kolommen (half-blocks later), hoogte auto
const TARGET_W = 24;
const sx = Math.max(1, Math.round(cw / TARGET_W));
const sy = Math.max(1, Math.round(sx * 2)); // terminal cellen zijn ~2x hoog
const out = [];
for (let y = 0; y < ch; y += sy) {
  const row = [];
  for (let x = 0; x < cw; x += sx) {
    const colors = [];
    for (let dy = 0; dy < sy; dy++) for (let dx = 0; dx < sx; dx++) {
      const c = crop[y+dy]?.[x+dx];
      if (c) colors.push(c.split(",").map(Number));
    }
    if (colors.length === 0) row.push(null);
    else {
      const avg = colors.reduce((a, c) => [a[0]+c[0], a[1]+c[1], a[2]+c[2]], [0,0,0]).map(v => Math.round(v / colors.length));
      row.push(avg.join(","));
    }
  }
  out.push(row);
}
const ow = out[0].length;

// 4) schrijf TS-module: rijen als "r,g,b|-gescheiden" strings (compact)
const rowsTs = out.map(r => `  "${r.map(c => c ?? "-").join("|")}",`).join("\n");
const ts = `/**
 * lantern-art.ts
 * ---------------------------------------------------------------------------
 * De wensballon (Kongming-lantaarn) als pixelgrid, overgenomen en verkleind
 * van de ChefGroep fastfetch-art. Gegenereerd door scripts/gen-lantern.mjs —
 * draai die opnieuw na een art-update; hand-editen kan niet kloppen.
 * Per rij: kleurcellen "r,g,b" gescheiden door "|", "-" = leeg.
 * ---------------------------------------------------------------------------
 */

export const LANTERN_ROWS: string[] = [
${rowsTs}
];
`;
writeFileSync("src/welcome/lantern-art.ts", ts);
console.log(`source ${cw}x${ch} -> lantern ${ow}x${out.length} (scale ${sx}x${sy})`);
