import { createSignalRuntime } from "../src/signal/controller.ts";
import { renderActivity } from "../src/render/motion-rail.ts";
import { getStructuralPreset } from "../src/config/structural-presets.ts";

const strip = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, "");
const spec = getStructuralPreset("lanternwake").signal;

console.log("=== READY/thinking (active, not streaming) — should be directional comet ===");
for (let t = 0; t < 24; t++) {
  const s = createSignalRuntime(t);
  s.activity = "thinking";
  s.active = true;
  s.tick = t;
  console.log(`t=${String(t).padStart(2)}: ${strip(renderActivity(s, spec, false))}`);
}

console.log("\n=== Compacting ===");
for (let t = 0; t < 12; t++) {
  const s = createSignalRuntime(t);
  s.activity = "compacting";
  s.active = true;
  s.tick = t;
  console.log(`t=${String(t).padStart(2)}: ${strip(renderActivity(s, spec, false))}`);
}

console.log("\n=== ASCII thinking ===");
for (let t = 0; t < 12; t++) {
  const s = createSignalRuntime(t);
  s.activity = "thinking";
  s.active = true;
  s.tick = t;
  console.log(`t=${String(t).padStart(2)}: ${strip(renderActivity(s, spec, true))}`);
}