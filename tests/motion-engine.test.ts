import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CADENCE_MS,
  CHANNEL_MATRIX,
  MOTION_CATALOG,
  allowedChannels,
  allowsColorTransition,
  cadenceFor,
  channelsForEvent,
  defaultMotionFor,
  describeMotionEvent,
  effectiveLevel,
  eventUsesChannel,
  frameAt,
  getMotion,
  isContinuous,
  lanternGlow,
  sweepPosition,
  targetFps,
  trailGlyph,
  DEFAULT_MOTION_POLICY,
  MotionScheduler,
} from "../src/motion/index.ts";
import type { MotionEvent, MotionPolicy } from "../src/motion/index.ts";
import type { RenderScheduler } from "../src/render/timer.ts";

function harness() {
  let now = 0;
  let renders = 0;
  let pending: number | null = null;
  let render: (() => void) | null = null;

  const timer: RenderScheduler = {
    schedule(delayMs = 0) {
      pending = delayMs;
    },
    cancel() {
      pending = null;
    },
  };

  const scheduler = new MotionScheduler({
    requestRender: () => {
      renders += 1;
    },
    createTimer: (fn) => {
      render = fn;
      return timer;
    },
    now: () => now,
  });

  return {
    scheduler,
    get renders() {
      return renders;
    },
    get pending() {
      return pending;
    },
    advance(ms: number) {
      now += ms;
    },
    fire() {
      pending = null;
      render?.();
    },
  };
}

test("idle never occupies the working glyph or signal", () => {
  assert.deepEqual([...CHANNEL_MATRIX.idle], ["ambient"]);
  assert.equal(eventUsesChannel("idle", "workingGlyph"), false);
  assert.equal(eventUsesChannel("idle", "signal"), false);
});

test("streaming drives working glyph, signal, and panel", () => {
  assert.deepEqual([...channelsForEvent("streaming")], [
    "workingGlyph",
    "signal",
    "panelIndicator",
  ]);
});

test("a policy denial never starts a spinner", () => {
  const channels = channelsForEvent("policy.deny");
  assert.equal(channels.includes("workingGlyph"), false);
  assert.equal(channels.includes("signal"), false);
  assert.equal(channels.includes("borderEmphasis"), true);
});

test("every catalog motion declares channels it is allowed to drive", () => {
  for (const motion of MOTION_CATALOG) {
    assert.ok(motion.channels.length > 0, `${motion.id} has no channels`);
    assert.ok(motion.fallbackGlyph.length > 0, `${motion.id} has no ASCII fallback`);
    assert.ok(motion.description.length > 0, `${motion.id} has no description`);
  }
});

test("every event maps to a motion that exists", () => {
  const events: MotionEvent[] = Object.keys(CHANNEL_MATRIX) as MotionEvent[];
  for (const event of events) {
    const motion = getMotion(defaultMotionFor(event));
    assert.ok(motion, `no motion for ${event}`);
  }
});

test("screen reader and motion off allow nothing", () => {
  const reader: MotionPolicy = { ...DEFAULT_MOTION_POLICY, screenReader: true };
  const off: MotionPolicy = { ...DEFAULT_MOTION_POLICY, level: "off" };
  assert.equal(allowedChannels("streaming", reader).length, 0);
  assert.equal(allowedChannels("streaming", off).length, 0);
  assert.equal(targetFps(reader, ["signal"], ["signal"]), 0);
  assert.equal(allowsColorTransition(off), false);
});

test("reduced motion drops continuous sweep and ambient", () => {
  const channels = allowedChannels("streaming", {
    ...DEFAULT_MOTION_POLICY,
    level: "reduced",
  });
  assert.equal(channels.includes("signal"), false);
  assert.equal(channels.includes("ambient"), false);
  assert.equal(channels.includes("workingGlyph"), true);
});

test("a reduced-motion host preference downgrades full motion", () => {
  const policy: MotionPolicy = { ...DEFAULT_MOTION_POLICY, reducedMotion: true };
  assert.equal(effectiveLevel(policy), "reduced");
  assert.equal(allowedChannels("streaming", policy).includes("signal"), false);
});

test("functional motion keeps only state channels", () => {
  const channels = allowedChannels("compact", {
    ...DEFAULT_MOTION_POLICY,
    level: "functional",
  });
  assert.deepEqual(channels, ["workingGlyph", "panelIndicator"]);
});

test("toggles switch off single channels", () => {
  const policy: MotionPolicy = {
    ...DEFAULT_MOTION_POLICY,
    toggles: { ...DEFAULT_MOTION_POLICY.toggles, signal: false },
  };
  assert.equal(allowedChannels("streaming", policy).includes("signal"), false);
  assert.equal(allowedChannels("streaming", policy).includes("workingGlyph"), true);
});

test("cadence stays inside the documented bands", () => {
  for (const channel of Object.keys(CADENCE_MS) as Array<keyof typeof CADENCE_MS>) {
    const ms = cadenceFor(channel, DEFAULT_MOTION_POLICY);
    assert.ok(ms >= CADENCE_MS[channel].min, `${channel} too fast`);
    assert.ok(ms <= CADENCE_MS[channel].max, `${channel} too slow`);
  }
  assert.equal(cadenceFor("signal", DEFAULT_MOTION_POLICY, true), 50);
});

test("idle without an ambient consumer is 0 FPS", () => {
  assert.equal(targetFps(DEFAULT_MOTION_POLICY, ["ambient"], []), 0);
  assert.equal(targetFps(DEFAULT_MOTION_POLICY, ["ambient"], ["ambient"]), 8);
  assert.equal(targetFps(DEFAULT_MOTION_POLICY, ["signal"], ["signal"]), 16);
});

test("scheduler stays stopped until a consumer subscribes", () => {
  const h = harness();
  assert.equal(h.scheduler.running, false);
  assert.equal(h.scheduler.activeCount, 0);
  assert.equal(h.scheduler.nextDelay(), null);
  assert.equal(h.pending, null);
});

test("scheduler cancels the clock when the last consumer leaves", () => {
  const h = harness();
  const stop = h.scheduler.subscribe({ id: "signal", channel: "signal", onTick: () => {} });
  assert.equal(h.scheduler.running, true);
  stop();
  assert.equal(h.scheduler.running, false);
  assert.equal(h.scheduler.activeCount, 0);
  assert.equal(h.pending, null);
});

test("scheduler ticks a consumer and asks for one render per frame", () => {
  const h = harness();
  const ticks: number[] = [];
  h.scheduler.subscribe({ id: "signal", channel: "signal", onTick: (tick) => ticks.push(tick) });

  h.advance(100);
  h.fire();
  h.advance(100);
  h.fire();

  assert.deepEqual(ticks, [1, 2]);
  assert.equal(h.renders, 2);
});

test("a slow consumer does not tick on a fast neighbour's frame", () => {
  const h = harness();
  const signal: number[] = [];
  const ambient: number[] = [];
  h.scheduler.subscribe({ id: "signal", channel: "signal", onTick: (t) => signal.push(t) });
  h.scheduler.subscribe({ id: "ambient", channel: "ambient", onTick: (t) => ambient.push(t) });

  h.advance(100);
  h.fire();

  assert.deepEqual(signal, [1]);
  assert.deepEqual(ambient, []);

  h.advance(400);
  h.fire();

  assert.deepEqual(signal, [1, 2]);
  assert.deepEqual(ambient, [1]);
});

test("finite motions release themselves after maxTicks", () => {
  const h = harness();
  let done = false;
  h.scheduler.subscribe({
    id: "bloom",
    channel: "deckTransient",
    maxTicks: 2,
    onTick: () => {},
    onDone: () => {
      done = true;
    },
  });

  h.advance(100);
  h.fire();
  h.advance(100);
  h.fire();

  assert.equal(done, true);
  assert.equal(h.scheduler.activeCount, 0);
  assert.equal(h.scheduler.running, false);
});

test("interval overrides are clamped to the channel band", () => {
  const h = harness();
  h.scheduler.subscribe({ id: "signal", channel: "signal", intervalMs: 5, onTick: () => {} });
  assert.equal(h.scheduler.nextDelay(), CADENCE_MS.signal.min);
});

test("scheduler reports the channels something actually renders", () => {
  const h = harness();
  h.scheduler.subscribe({ id: "a", channel: "signal", onTick: () => {} });
  h.scheduler.subscribe({ id: "b", channel: "signal", onTick: () => {} });
  h.scheduler.subscribe({ id: "c", channel: "panelIndicator", onTick: () => {} });
  assert.deepEqual(h.scheduler.activeChannels().sort(), ["panelIndicator", "signal"]);
});

test("dispose drops every consumer", () => {
  const h = harness();
  h.scheduler.subscribe({ id: "a", channel: "signal", onTick: () => {} });
  h.scheduler.dispose();
  assert.equal(h.scheduler.activeCount, 0);
  assert.equal(h.scheduler.running, false);
});

test("ember frames follow the lantern glyph set and fall back to ASCII", () => {
  const ember = getMotion("ember-relay");
  assert.ok(ember);
  const frames = [0, 1, 2, 3].map((tick) => frameAt(ember, tick));
  assert.deepEqual(frames, ["◇", "◈", "◆", "◈"]);
  assert.equal(frameAt(ember, 1, true), "*");
});

test("lantern glow stays normalised", () => {
  for (let ms = 0; ms < 20_000; ms += 250) {
    const glow = lanternGlow(ms);
    assert.ok(glow >= 0 && glow <= 1, `glow out of range at ${ms}`);
  }
});

test("sweep stands still when nothing is animating", () => {
  assert.equal(sweepPosition(5, 14, false), -1);
  assert.equal(sweepPosition(0, 14, true), 0);
  assert.equal(sweepPosition(0, 14, true, "reverse"), 13);
  assert.equal(trailGlyph(0), "█");
  assert.equal(trailGlyph(9), "━");
  assert.equal(trailGlyph(0, true), "*");
});

test("continuous events are separated from one-shot events", () => {
  assert.equal(isContinuous("streaming"), true);
  assert.equal(isContinuous("idle"), true);
  assert.equal(isContinuous("success"), false);
  assert.equal(isContinuous("policy.deny"), false);
});

test("status text stays readable without motion", () => {
  assert.equal(describeMotionEvent("tool.start", "read_file"), "running read_file");
  assert.equal(describeMotionEvent("policy.deny"), "blocked by policy");
  assert.equal(describeMotionEvent("idle"), "idle");
});
