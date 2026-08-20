import test from "node:test";
import assert from "node:assert/strict";

import {
  formatTpsRate,
  pushTpsSample,
  ratesFromRing,
  summarizeTpsRing,
  tpsOverlayLines,
  type TpsSample,
} from "../src/usage/tps-ring.ts";

test("ratesFromRing uses the same window lookback as the segment", () => {
  const samples: TpsSample[] = [
    { at: 1000, output: 0, input: 0 },
    { at: 2000, output: 80, input: 10 },
  ];
  const rates = ratesFromRing(samples, 2000, { output: 80, input: 10 }, 1000);
  assert.equal(rates.outRate, 80);
  assert.equal(rates.inRate, 10);
});

test("summarizeTpsRing reports peak and average over consecutive samples", () => {
  const samples: TpsSample[] = [
    { at: 0, output: 0, input: 0 },
    { at: 1000, output: 100, input: 10 },
    { at: 2000, output: 120, input: 12 },
  ];
  const summary = summarizeTpsRing(samples, 2000, { output: 120, input: 12 }, {
    windowMs: 1000,
  });
  assert.equal(summary.samples, 3);
  assert.equal(summary.peakOut, 100);
  assert.equal(summary.avgOut, 60);
  assert.equal(summary.override, null);
  const lines = tpsOverlayLines(summary);
  assert.match(lines[1] ?? "", /out/);
});

test("pushTpsSample prunes samples older than the ring", () => {
  const samples: TpsSample[] = [];
  pushTpsSample(samples, { at: 0, output: 1, input: 0 }, 5000);
  pushTpsSample(samples, { at: 6000, output: 2, input: 0 }, 5000);
  assert.equal(samples.length, 1);
  assert.equal(samples[0]?.at, 6000);
});

test("formatTpsRate keeps one decimal under 100", () => {
  assert.equal(formatTpsRate(12.34), "12.3");
  assert.equal(formatTpsRate(120.4), "120");
});

test("tps overlay names an override instead of inventing a second sampler", () => {
  const lines = tpsOverlayLines(
    summarizeTpsRing([], 0, { input: 0, output: 0 }, { override: "42" }),
  );
  assert.match(lines[0] ?? "", /override 42/);
});
