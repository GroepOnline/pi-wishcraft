import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePowerlineConfig } from "../src/config/powerline-config.ts";
import { PRESET_NAMES } from "../src/extension/core/state.ts";
import { DEFAULT_MOTION_POLICY, MotionScheduler } from "../src/motion/index.ts";
import type { RenderScheduler } from "../src/render/timer.ts";
import {
  createSignalRuntime,
  setSignalEvent,
  stopSignal,
} from "../src/signal/controller.ts";
import { renderActivity, renderSignal, renderSignalScreenReader } from "../src/signal/render.ts";
import { renderRailSweep, SIGNAL_RAIL_WIDTH, railHeadIndex } from "../src/signal/rail.ts";
import { visibleWidth } from "@earendil-works/pi-tui";
import { getStructuralPreset } from "../src/config/structural-presets.ts";
import { PRESETS } from "../src/config/presets.ts";
import type { SegmentContext } from "../src/config/types.ts";
import { registerCommands } from "../src/extension/commands/commands.ts";

function schedulerHarness() {
  let callback: (() => void) | null = null;
  let pending = false;
  let now = 0;
  const timer: RenderScheduler = {
    schedule() {
      pending = true;
    },
    cancel() {
      pending = false;
    },
  };
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
    get pending() {
      return pending;
    },
    advance(ms = 120) {
      now += ms;
      pending = false;
      callback?.();
    },
  };
}

test("Signal leases the shared scheduler only while active", () => {
  const harness = schedulerHarness();
  const signal = createSignalRuntime(0);
  const policy = {
    ...DEFAULT_MOTION_POLICY,
    toggles: { ...DEFAULT_MOTION_POLICY.toggles },
  };

  assert.equal(harness.scheduler.activeCount, 0);
  setSignalEvent(signal, harness.scheduler, policy, "streaming");
  assert.equal(harness.scheduler.activeCount, 1);
  assert.equal(harness.scheduler.activeChannels()[0], "signal");
  assert.equal(harness.pending, true);

  harness.advance();
  assert.equal(signal.tick, 1);

  stopSignal(signal, harness.scheduler, policy);
  assert.equal(signal.active, false);
  assert.equal(harness.scheduler.activeCount, 0);
  assert.equal(harness.scheduler.running, false);
  assert.equal(harness.pending, false);
});

test("reduced motion keeps stable Signal text without scheduling frames", () => {
  const harness = schedulerHarness();
  const signal = createSignalRuntime(0);
  const policy = {
    ...DEFAULT_MOTION_POLICY,
    level: "reduced" as const,
    toggles: { ...DEFAULT_MOTION_POLICY.toggles },
  };
  setSignalEvent(signal, harness.scheduler, policy, "tool.start", {
    activity: "tool read",
  });
  assert.equal(signal.active, false);
  assert.equal(signal.activity, "tool read");
  assert.equal(harness.scheduler.activeCount, 0);
});

test("Signal activity uses structural motion and ASCII fallback", () => {
  const signal = createSignalRuntime(0);
  signal.event = "streaming";
  signal.motionId = "ember-relay";
  signal.activity = "streaming";
  signal.active = true;
  signal.tick = 2;
  const spec = getStructuralPreset("lanternwake").signal;

  assert.match(stripAnsi(renderActivity(signal, spec, false)), /◆/);
  assert.match(stripAnsi(renderActivity(signal, spec, true)), /\*/);
  assert.match(stripAnsi(renderActivity(signal, spec, true)), /streaming/);
});

test("Signal renders left, center, and right lanes on one line", () => {
  const signal = createSignalRuntime(0);
  signal.activity = "ready";
  const result = renderSignal(
    segmentContext(),
    PRESETS.minimal,
    signal,
    100,
    {
      separatorStyle: "slash",
      signal: getStructuralPreset("lanternwake").signal,
      ascii: true,
    },
  );
  const line = stripAnsi(result.topContent);
  assert.match(line, /project/); // left lane
  assert.match(line, /ready/); // center lane
  assert.match(line, /47%/); // right lane
  assert.ok(line.indexOf("project") < line.indexOf("ready"));
  assert.ok(line.indexOf("ready") < line.indexOf("47%"));
});

test("appearance config accepts independent structural layers", () => {
  const parsed = parsePowerlineConfig(
    {
      appearance: {
        base: "lanternwake",
        palette: "scryglass",
        signalLayout: "threadbound",
        motion: { streaming: "lunar-breathe" },
      },
    },
    PRESET_NAMES,
  );
  assert.deepEqual(parsed.appearance, {
    base: "lanternwake",
    palette: "scryglass",
    signalLayout: "threadbound",
    motion: { streaming: "lunar-breathe" },
  });
});

test("travelling rail advances the head on each tick and stays still when idle", () => {
  const idle = renderRailSweep({ tick: 3, width: 8, animating: false });
  assert.equal(idle, "━━━━━━━━");
  assert.equal(railHeadIndex(3, 8, false), -1);

  const t0 = renderRailSweep({ tick: 0, width: 8, animating: true });
  const t1 = renderRailSweep({ tick: 1, width: 8, animating: true });
  assert.notEqual(t0, t1);
  assert.equal(t0.length, 8);
  assert.equal(t1.length, 8);
  assert.equal(railHeadIndex(0, 8, true), 0);
  assert.equal(railHeadIndex(1, 8, true), 1);
});

test("ASCII rail uses star head and dash track", () => {
  const rail = renderRailSweep({ tick: 0, width: 6, animating: true, ascii: true });
  assert.equal(rail[0], "*");
  assert.match(rail, /-/);
  assert.equal(rail.length, 6);
  const still = renderRailSweep({ tick: 2, width: 6, animating: false, ascii: true });
  assert.equal(still, "------");
});

test("Signal activity paints a travelling rail plus the motion glyph", () => {
  const signal = createSignalRuntime(0);
  signal.event = "streaming";
  signal.motionId = "ember-relay";
  signal.activity = "streaming";
  signal.active = true;
  signal.tick = 2;
  const spec = getStructuralPreset("lanternwake").signal;
  const text = stripAnsi(renderActivity(signal, spec, false));
  assert.match(text, /◆/);
  assert.match(text, /streaming/);
  assert.ok(text.includes("█") || text.includes("━"));
});

test("reduced motion Signal keeps a still rail and a stable marker", () => {
  const signal = createSignalRuntime(0);
  signal.event = "streaming";
  signal.activity = "streaming";
  signal.active = true;
  signal.tick = 4;
  const spec = getStructuralPreset("lanternwake").signal;
  const policy = { ...DEFAULT_MOTION_POLICY, level: "reduced" as const };
  const a = stripAnsi(renderActivity(signal, spec, true, policy));
  const b = stripAnsi(
    renderActivity({ ...signal, tick: 5 }, spec, true, policy),
  );
  assert.equal(a.replace(/streaming/, ""), b.replace(/streaming/, ""));
  assert.match(a, /\[/);
});

test("NO_COLOR Signal output contains no ANSI", () => {
  const signal = createSignalRuntime(0);
  signal.activity = "ready";
  const result = renderSignal(segmentContext(), PRESETS.minimal, signal, 80, {
    separatorStyle: "slash",
    signal: getStructuralPreset("lanternwake").signal,
    ascii: true,
    policy: { ...DEFAULT_MOTION_POLICY, noColor: true },
    color: false,
  });
  assert.equal(result.topContent.includes("\x1b["), false);
});

test("screen-reader Signal is stable semantic text", () => {
  const signal = createSignalRuntime(0);
  signal.event = "streaming";
  signal.activity = "streaming";
  const ctx = segmentContext();
  const text = renderSignalScreenReader(ctx, signal);
  assert.equal(text, "Model: GPT-5.6 | Git: none | State: streaming | Context: 47%");
  const rendered = renderSignal(ctx, PRESETS.minimal, signal, 80, {
    separatorStyle: "slash",
    signal: getStructuralPreset("lanternwake").signal,
    policy: { ...DEFAULT_MOTION_POLICY, screenReader: true },
  });
  assert.equal(rendered.topContent, text);
  assert.equal(rendered.secondaryContent, "");
});

test("Signal top line never exceeds the available width", () => {
  const signal = createSignalRuntime(0);
  signal.activity = "streaming";
  signal.active = true;
  signal.event = "streaming";
  for (const width of [20, 40, 60, 80, 120]) {
    const result = renderSignal(segmentContext(), PRESETS.minimal, signal, width, {
      separatorStyle: "slash",
      signal: getStructuralPreset("lanternwake").signal,
      ascii: true,
      color: false,
      railWidth: SIGNAL_RAIL_WIDTH,
    });
    assert.ok(
      visibleWidth(result.topContent) <= width,
      `width ${width} got ${visibleWidth(result.topContent)}`,
    );
  }
});

test("/signal is primary and /powerline remains a compatibility alias", () => {
  const commands = new Map<string, { description?: string }>();
  const pi = {
    registerCommand(name: string, command: { description?: string }) {
      commands.set(name, command);
    },
    registerShortcut() {},
  } as never;
  registerCommands(pi, {
    resolvedShortcuts: { menu: null, info: null },
  } as never);
  assert.match(commands.get("signal")?.description ?? "", /Signal/);
  assert.match(commands.get("powerline")?.description ?? "", /alias/);
});

function segmentContext(): SegmentContext {
  return {
    model: { id: "gpt-5.6", name: "GPT-5.6" },
    thinkingLevel: "off",
    sessionId: "session",
    cwd: "/workspace/project",
    usageStats: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
      subagentCost: 0,
    },
    contextTokens: 47,
    contextPercent: 47,
    contextWindow: 100,
    autoCompactEnabled: true,
    customCompactionEnabled: false,
    usingSubscription: false,
    queueSummary: {
      queueCount: 0,
      ideaCount: 0,
      blockedCount: 0,
      compacting: false,
      leadingText: null,
      leadingIntent: null,
      leadingStatus: null,
    },
    sessionStartTime: 0,
    shellModeActive: false,
    shellRunning: false,
    shellName: null,
    shellCwd: null,
    git: {
      branch: null,
      staged: 0,
      unstaged: 0,
      untracked: 0,
      ahead: 0,
      behind: 0,
      commit: null,
    },
    extensionStatuses: new Map(),
    hiddenExtensionStatusKeys: new Set(),
    customItemsById: new Map(),
    effectiveCustomItems: [],
    options: { path: { mode: "basename" }, context: { format: "percent" } },
    segmentLabels: new Map(),
    theme: { fg: (_color, text) => text },
    colors: {},
  };
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}
