#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
exec node --input-type=module --experimental-strip-types - <<'EOF'
import { writeFileSync } from "node:fs";
import { brailleWave, boids, chevrons, shimmer, seismo } from "./src/render/motion-candidates.ts";

const cands = { "braille-wave": brailleWave, boids, chevrons, shimmer, seismo };
const SHADE = /[░▒▓█]/;
let violations = 0, candidates = 0, worstUs = 0;

for (const [name, fn] of Object.entries(cands)) {
  candidates++;
  const lines = [];
  for (let t = 0; t < 24; t++) {
    const t0 = performance.now();
    const frame = fn(t, false);
    const us = (performance.now() - t0) * 1000;
    if (us > worstUs) worstUs = us;
    if (frame.length !== 12) { violations++; lines.push(`t${t} WIDTH=${frame.length} !!`); }
    if (SHADE.test(frame)) { violations++; lines.push(`t${t} SHADE !! ${frame}`); }
    const a = fn(t, true);
    if (SHADE.test(a)) { violations++; lines.push(`t${t} ASCII-SHADE !!`); }
    lines.push(`t${String(t).padStart(2)} ${frame}  |  ${a}`);
  }
  writeFileSync(`.auto/frames-${name}.txt`, lines.join("\n") + "\n");
  console.error(`${name}: 24 frames -> .auto/frames-${name}.txt`);
}

console.log(`METRIC violations=${violations}`);
console.log(`METRIC render_us=${worstUs.toFixed(1)}`);
console.log(`METRIC candidates=${candidates}`);
EOF