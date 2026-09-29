import assert from "node:assert/strict";
import test from "node:test";
import {
  frameAt,
  fractionalTick,
  interpTick,
  sweepMovingRight,
  sweepPhase,
} from "../src/motion/frames.ts";
import { buildSweepCells } from "../src/motion/sweep-cells.ts";
import { previewStrip } from "../src/motion/gallery.ts";
import { getMotion } from "../src/motion/catalog.ts";
import { effectiveIntervalMs } from "../src/motion/scheduler.ts";
import { renderActivity } from "../src/render/motion-rail.ts";
import { createSignalRuntime } from "../src/signal/controller.ts";
import type { SignalSpec } from "../src/config/types.ts";
import { stripAnsi } from "./helpers/strip-ansi.ts";

const TEST_SIGNAL_SPEC: SignalSpec = {
  layout: "standard",
  separators: { left: "[", right: "]" },
  caps: {},
  animation: "ember-relay",
};

function streamingRuntime(tick: number, lastTickAt?: number) {
  const signal = createSignalRuntime(0);
  signal.event = "streaming";
  signal.motionId = "ember-relay";
  signal.activity = "streaming";
  signal.active = true;
  signal.tick = tick;
  signal.lastTickAt = lastTickAt;
  return signal;
}

function railBody(rendered: string): string {
  const match = /^\[(.*)\] /.exec(stripAnsi(rendered));
  assert.ok(match, `expected a bracketed activity rail, got ${rendered}`);
  return match[1]!;
}

test("frameAt floors fractional ticks to the frame they are in", () => {
  const def = getMotion("ember-relay");
  assert.ok(def);
  for (let tick = -2; tick <= 8; tick++) {
    const whole = frameAt(def, tick);
    assert.equal(frameAt(def, tick + 0.25), whole);
    assert.equal(frameAt(def, tick + 0.5), whole);
    assert.equal(frameAt(def, tick + 0.99), whole);
    assert.equal(frameAt(def, tick, true), def.fallbackGlyph);
  }
});

test("fractionalTick converts elapsed time to sub-tick progress", () => {
  assert.equal(fractionalTick(250, 100), 2.5);
  assert.equal(fractionalTick(0, 100), 0);
  assert.equal(fractionalTick(100, 0), 0);
});

test("interpTick interpolates inside one heartbeat and never drifts", () => {
  // No clock readings (tests driving ticks by hand) stay exact.
  assert.equal(interpTick(3, undefined, 1000, 80), 3);
  assert.equal(interpTick(3, 1000, undefined, 80), 3);
  // Within one interval: smooth sub-tick progress.
  assert.equal(interpTick(3, 1000, 1040, 80), 3.5);
  // Outside one interval: stale heartbeat or disagreeing clocks — the plain
  // tick is the honest value, so rendering can never jump ahead.
  assert.equal(interpTick(3, 1000, 1200, 80), 3);
  assert.equal(interpTick(3, 1000, 900, 80), 3);
  assert.equal(interpTick(3, 1000, 1000, 80), 3);
  assert.equal(interpTick(3, 1000, 1040, 0), 3);
});

test("sweepMovingRight orients the wake on both legs", () => {
  // width 12 → span 11, period 22: first leg ticks 0..11, return leg 12..21.
  assert.equal(sweepMovingRight(0, 12, "forward"), true);
  assert.equal(sweepMovingRight(11, 12, "forward"), true);
  assert.equal(sweepMovingRight(12, 12, "forward"), false);
  assert.equal(sweepMovingRight(21, 12, "forward"), false);
  assert.equal(sweepMovingRight(22, 12, "forward"), true);
  // Reverse flips the configured direction but not the wake rule.
  assert.equal(sweepMovingRight(0, 12, "reverse"), false);
  assert.equal(sweepMovingRight(12, 12, "reverse"), true);
});

test("buildSweepCells resolves head, trail and track exactly once", () => {
  const cells = buildSweepCells({ width: 10, pos: 4, movingRight: true, trailDepth: 2 });
  assert.deepEqual(
    cells.map((cell) => cell.kind),
    ["track", "track", "trail", "trail", "head", "track", "track", "track", "track", "track"],
  );
  assert.equal(cells[2]!.step, 2);
  assert.equal(cells[3]!.step, 1);
  assert.equal(cells[4]!.distance, 0);

  // The wake flips with the head direction: same structure mirrored.
  const back = buildSweepCells({ width: 10, pos: 4, movingRight: false, trailDepth: 2 });
  assert.deepEqual(
    back.map((cell) => cell.kind),
    ["track", "track", "track", "track", "head", "trail", "trail", "track", "track", "track"],
  );

  // Fractional head position stays within half a cell of the painted head.
  const half = buildSweepCells({ width: 10, pos: 4.5, movingRight: true, trailDepth: 2 });
  assert.equal(half[4]!.kind, "head");
  assert.equal(half[3]!.kind, "trail");
  assert.equal(half[3]!.distance, 1.5);
  assert.equal(half[3]!.step, 2);
});

test("goldens: gallery previews and rails keep their pinned output", () => {
  // Regeneration is deliberate (see signal-golden.test.ts): change these only
  // in a dedicated commit after eyeballing the rendered strings.
  const emberRelay = getMotion("ember-relay")!;
  const wisp = getMotion("wisp")!;
  const bar = getMotion("bar")!;

  assert.equal(previewStrip(emberRelay, 5, 14, true), "-->=*---------");
  assert.equal(previewStrip(wisp, 13, 14, false), "───────────╾━◎");
  assert.equal(previewStrip(bar, 2, 14, true), ">==-----------");

  assert.equal(railBody(renderActivity(streamingRuntime(2), TEST_SIGNAL_SPEC, true, 100)), "=o----------");

  const compact = streamingRuntime(2);
  compact.event = "compact";
  compact.motionId = "bar";
  compact.activity = "compacting";
  assert.equal(railBody(renderActivity(compact, TEST_SIGNAL_SPEC, true, 100)), "--o======o--");

  const idle = createSignalRuntime(0);
  idle.tick = 23;
  idle.idleAnimated = true;
  assert.equal(railBody(renderActivity(idle, TEST_SIGNAL_SPEC, false, 100)), "─◈◈◈⬡◈◎◎◈◈──");
});

test("rail interpolation moves the head between scheduler heartbeats", () => {
  const def = getMotion("ember-relay")!;
  const intervalMs = effectiveIntervalMs({
    channel: "signal",
    preview: false,
    intervalMs: def.generator?.intervalMs,
  });

  const atBeat = railBody(renderActivity(streamingRuntime(2, 1000), TEST_SIGNAL_SPEC, true, 100, 1000));
  const atNext = railBody(
    renderActivity(streamingRuntime(2, 1000), TEST_SIGNAL_SPEC, true, 100, 1000 + intervalMs),
  );

  // Exactly on the heartbeat the plain tick renders — interpolation adds
  // nothing at the anchor points.
  const handDriven = railBody(renderActivity(streamingRuntime(2), TEST_SIGNAL_SPEC, true, 100));
  assert.equal(atBeat, handDriven);

  // One full interpolated interval later the head has advanced exactly one
  // cell — without interpolation it would sit on the same tick forever.
  const headAt = (body: string) => body.indexOf("o");
  assert.ok(headAt(atBeat) >= 0, `head missing in ${atBeat}`);
  assert.equal(headAt(atNext), headAt(atBeat) + 1);
});

test("interpolation is inert without a heartbeat reading", () => {
  // Tests (and legacy call sites) that drive runtime.tick by hand get exact
  // integer rendering no matter what the wall clock says.
  const raw = renderActivity(streamingRuntime(2), TEST_SIGNAL_SPEC, true, 100, Date.now() + 60_000);
  assert.equal(
    railBody(raw),
    railBody(renderActivity(streamingRuntime(2), TEST_SIGNAL_SPEC, true, 100)),
  );
});

test("sweepPhase accepts fractional ticks continuously", () => {
  const width = 14;
  for (const ease of ["linear", "pulse"] as const) {
    let prev = sweepPhase(0, width, true, "forward", ease);
    for (let tick = 0.25; tick <= 20; tick += 0.25) {
      const pos = sweepPhase(tick, width, true, "forward", ease);
      assert.ok(Math.abs(pos - prev) <= 0.5, `${ease} position jumped at tick ${tick}`);
      prev = pos;
    }
  }
});
