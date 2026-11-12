import test from "node:test";
import assert from "node:assert/strict";

import {
  formatTpsRate,
  pushTpsSample,
  ratesFromRing,
  summarizeTpsRing,
  tpsOverlayLines,
  TPS_MIN_PAIRWISE_DT_MS,
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

test("idle repaints with unchanged counts do not drag the average to zero", () => {
  const samples: TpsSample[] = [];
  pushTpsSample(samples, { at: 0, output: 0, input: 0 }, 5000);
  pushTpsSample(samples, { at: 500, output: 50, input: 0 }, 5000);
  for (let at = 600; at <= 1500; at += 100) {
    pushTpsSample(samples, { at, output: 50, input: 0 }, 5000);
  }
  const summary = summarizeTpsRing(samples, 1500, { output: 50, input: 0 });
  assert.equal(summary.peakOut, 100);
  assert.equal(summary.avgOut, 100);
});

test("sub-frame sample pairs cannot report a burst as a spike", () => {
  const samples: TpsSample[] = [
    { at: 0, output: 0, input: 0 },
    { at: 1000, output: 100, input: 0 },
    { at: 1002, output: 112, input: 0 },
    { at: 2000, output: 200, input: 0 },
  ];
  const summary = summarizeTpsRing(samples, 2000, { output: 200, input: 0 });
  assert.ok(2 < TPS_MIN_PAIRWISE_DT_MS);
  assert.ok(summary.peakOut <= 112, `peak ${summary.peakOut} looks like a repaint spike`);
});

test("pushTpsSample drops duplicate counts inside the dedupe window", () => {
  const samples: TpsSample[] = [];
  pushTpsSample(samples, { at: 0, output: 5, input: 1 }, 5000);
  pushTpsSample(samples, { at: 10, output: 5, input: 1 }, 5000);
  pushTpsSample(samples, { at: 20, output: 6, input: 1 }, 5000);
  assert.equal(samples.length, 2);
});

test("ratesFromRing reports zero, not a measured rate, when nothing was generated", () => {
  const samples: TpsSample[] = [
    { at: 0, output: 40, input: 5 },
    { at: 1000, output: 40, input: 5 },
  ];
  const rates = ratesFromRing(samples, 1000, { output: 40, input: 5 }, 1000);
  assert.equal(rates.outRate, 0);
  assert.equal(rates.inRate, 0);
});

test("TTFT splits prompt processing from cache reads", () => {
  const samples: TpsSample[] = [
    { at: 0, output: 0, input: 1000, uncachedInput: 1000 },
    { at: 500, output: 2, input: 5000, uncachedInput: 1200, turnStartAt: 400 },
    { at: 600, output: 60, input: 5000, uncachedInput: 1200 },
  ];
  const rates = ratesFromRing(
    samples,
    600,
    { input: 5000, output: 60, cacheRead: 3800 },
    1000,
  );
  assert.equal(rates.ttftMs, 100);
  // 200 uncached tokens processed in 100 ms, not 4000 input deltas.
  assert.equal(rates.inRate, 2000);
});

test("a fully cached prompt reports no processed-input rate", () => {
  const samples: TpsSample[] = [
    { at: 0, output: 0, input: 1000, uncachedInput: 1000 },
    { at: 500, output: 2, input: 9000, uncachedInput: 1000, turnStartAt: 400 },
  ];
  const rates = ratesFromRing(
    samples,
    500,
    { input: 9000, output: 2, cacheRead: 8000 },
    1000,
  );
  assert.equal(rates.ttftMs, 100);
  assert.equal(rates.inRate, 0);
});

test("no turn marker keeps the plain window delta", () => {
  const samples: TpsSample[] = [
    { at: 0, output: 0, input: 0 },
    { at: 1000, output: 90, input: 30 },
  ];
  const rates = ratesFromRing(
    samples,
    1000,
    { input: 30, output: 90, cacheRead: 0 },
    1000,
  );
  assert.equal(rates.ttftMs, null);
  assert.equal(rates.inRate, 30);
});

test("the output EMA damps a single spike", () => {
  const samples: TpsSample[] = [
    { at: 0, output: 0, input: 0 },
    { at: 1000, output: 100, input: 0 },
    { at: 2000, output: 100, input: 0 },
    { at: 3000, output: 300, input: 0 },
  ];
  const rates = ratesFromRing(samples, 3000, { output: 300, input: 0 }, 1000);
  assert.ok(rates.emaOutFast !== undefined);
  assert.ok(rates.emaOutFast! < 200, `ema ${rates.emaOutFast} tracks the spike`);
  assert.ok(rates.emaOutFast! > 100, `ema ${rates.emaOutFast} ignored the trend`);
  assert.ok(
    rates.emaOutSlow !== undefined &&
      rates.emaOutSlow <= rates.emaOutFast,
    "slow EMA damps the spike harder than fast",
  );
});

test("the overlay shows ttft and ema only when they are measured", () => {
  const withTurn = summarizeTpsRing(
    [
      { at: 0, output: 0, input: 0 },
      { at: 400, output: 10, input: 200, turnStartAt: 300 },
      { at: 1400, output: 110, input: 200 },
    ],
    1400,
    { input: 200, output: 110, cacheRead: 0 },
    { windowMs: 1000 },
  );
  const lines = tpsOverlayLines(withTurn);
  assert.ok(lines.some((line) => line.startsWith("ttft ")));
  assert.ok(lines[1]?.includes("ema "));

  const withoutTurn = tpsOverlayLines(
    summarizeTpsRing([], 0, { input: 0, output: 0 }),
  );
  assert.ok(!withoutTurn.some((line) => line.startsWith("ttft ")));
});
