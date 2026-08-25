import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_MOTION_POLICY, MotionScheduler } from "../src/motion/index.ts";
import type { RenderScheduler } from "../src/render/timer.ts";
import { createSignalRuntime, setSignalEvent } from "../src/signal/controller.ts";

function schedulerHarness() {
  let callback: (() => void) | null = null;
  let now = 0;
  const timer: RenderScheduler = { schedule() {}, cancel() {} };
  const scheduler = new MotionScheduler({
    requestRender() {},
    createTimer(fn) {
      callback = fn;
      return timer;
    },
    now: () => now,
  });
  return {
    scheduler,
    advance(ms = 120) {
      now += ms;
      callback?.();
    },
  };
}

test("terminal Signal settlement preserves the configured idle motion", () => {
  const harness = schedulerHarness();
  const signal = createSignalRuntime(0);
  const policy = {
    ...DEFAULT_MOTION_POLICY,
    toggles: { ...DEFAULT_MOTION_POLICY.toggles },
  };

  setSignalEvent(signal, harness.scheduler, policy, "success", {
    motionId: "rune-bloom",
    settleMotionId: "lunar-breathe",
    maxTicks: 1,
    settleOnDone: true,
  });
  harness.advance();

  assert.equal(signal.event, "idle");
  assert.equal(signal.motionId, "lunar-breathe");
  assert.equal(signal.activity, "ready");
  assert.equal(signal.active, false);
  assert.equal(harness.scheduler.activeCount, 0);
});
