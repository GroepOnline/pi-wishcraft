import assert from "node:assert/strict";
import { test } from "node:test";
import {
  boids,
  brailleWave,
  chevrons,
  fatBand,
  seismo,
  shimmer,
} from "../src/render/motion-candidates.ts";
import { createSignalRuntime } from "../src/signal/controller.ts";
import { renderActivity } from "../src/render/motion-rail.ts";
import { getStructuralPreset } from "../src/config/structural-presets.ts";

test("extreme-motion candidates keep a stable width", () => {
  for (const render of [brailleWave, boids, chevrons, shimmer, seismo]) {
    assert.equal([...render(3, false)].length, 12);
    assert.equal([...render(3, true)].length, 12);
  }
  const [top, bottom] = fatBand(4, false, 16);
  assert.equal([...(top ?? "")].length, 16);
  assert.equal([...(bottom ?? "")].length, 16);
  assert.equal(fatBand(4, true, 10)[0], "~".repeat(10));
});

test("fat-band motion paints a one-row topographic rail", () => {
  const signal = createSignalRuntime(0);
  signal.event = "streaming";
  signal.motionId = "fat-band";
  signal.activity = "streaming";
  signal.active = true;
  signal.tick = 3;
  const spec = getStructuralPreset("lanternwake").signal;
  const rail = renderActivity(signal, spec, false, 80).replace(/\x1b\[[0-9;]*m/g, "");
  assert.doesNotMatch(rail, /\n/);
  assert.match(rail, /[▁▂▃▄▅▆▇█]/);
  assert.match(rail, /streaming/);
  const ascii = renderActivity(signal, spec, true, 80).replace(/\x1b\[[0-9;]*m/g, "");
  assert.match(ascii, /~/);
});
