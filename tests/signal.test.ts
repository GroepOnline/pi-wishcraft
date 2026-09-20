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
import { renderActivity } from "../src/render/motion-rail.ts";
import { renderStatusLineV2 } from "../src/render/v2-entry.ts";
import { getStructuralPreset } from "../src/config/structural-presets.ts";
import { PRESETS } from "../src/config/presets.ts";
import type { SegmentContext } from "../src/config/types.ts";
import { registerCommands } from "../src/extension/commands/commands.ts";
import {
  clearContributions,
  registerSignalSource,
} from "../src/extension/contrib/registry.ts";

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

  // The rail is always one row. A streaming response must never turn the
  // footer into a three-line block or push the operational segments down.
  const rail = stripAnsi(renderActivity(signal, spec, false));
  assert.doesNotMatch(rail, /\n/);
  assert.match(rail, /streaming/);
  assert.match(rail, /[◇◈◆]/);

  // ASCII is a real one-cell directional comet. Its trail remains behind
  // the head even when the configured motion uses a non-ASCII frame.
  // Eased sweeps (ember-relay pulses) decelerate near the rail edge, so the
  // trail may be any depth glyph — what matters is direction: behind the head.
  const asciiRail = stripAnsi(renderActivity(signal, spec, true));
  assert.match(asciiRail, /o/);
  assert.match(asciiRail, /streaming/);
  const headIndex = asciiRail.indexOf("o");
  const trailIndex = asciiRail.search(/[=>]/);
  assert.notEqual(headIndex, -1, "ASCII head must be present");
  assert.notEqual(trailIndex, -1, "ASCII trail must be present");
  assert.ok(headIndex > trailIndex, "ASCII trail must trail the head");
});

test("idle Signal is stable without a scheduler-driven clock", () => {
  const signal = createSignalRuntime(0);
  const spec = getStructuralPreset("lanternwake").signal;
  const originalNow = Date.now;
  try {
    Date.now = () => 1;
    const first = renderActivity(signal, spec, false, 160);
    Date.now = () => 9_999_999;
    const second = renderActivity(signal, spec, false, 160);
    assert.equal(first, second);
  } finally {
    Date.now = originalNow;
  }
});

test("Signal renders left, center, and right lanes on one line", () => {
  const signal = createSignalRuntime(0);
  signal.activity = "ready";
  const result = renderStatusLineV2(
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

test("Signal renders configured secondary segments on the secondary line", () => {
  const ctx = segmentContext();
  ctx.extensionStatuses.set("test", "syncing");
  const signal = createSignalRuntime(0);
  signal.activity = "ready";

  const result = renderStatusLineV2(ctx, PRESETS.default, signal, 200, {
    separatorStyle: "slash",
    signal: getStructuralPreset("lanternwake").signal,
    ascii: true,
  });

  assert.match(result.secondaryContent, /syncing/);
  assert.doesNotMatch(result.topContent, /syncing/);
});

test("Signal renders valid contributed sources and isolates empty or failing output", () => {
  clearContributions();
  try {
    assert.equal(registerSignalSource({ id: "ok", label: "OK", render: () => "contrib-ok" }), true);
    assert.equal(registerSignalSource({ id: "null", label: "Null", render: () => null }), true);
    assert.equal(registerSignalSource({ id: "empty", label: "Empty", render: () => "" }), true);
    assert.equal(registerSignalSource({ id: "space", label: "Space", render: () => "   " }), true);
    assert.equal(
      registerSignalSource({ id: "sgr-space", label: "SGR Space", render: () => "\x1b[31m   \x1b[0m" }),
      true,
    );
    assert.equal(registerSignalSource({ id: "csi-only", label: "CSI", render: () => "\x1b[2K" }), true);
    assert.equal(
      registerSignalSource({ id: "osc-only", label: "OSC", render: () => "\x1b]0;hidden\x07" }),
      true,
    );
    assert.equal(
      registerSignalSource({
        id: "throws",
        label: "Throws",
        render: () => {
          throw new Error("boom");
        },
      }),
      true,
    );

    const signal = createSignalRuntime(0);
    signal.activity = "ready";
    const result = renderStatusLineV2(
      segmentContext(),
      PRESETS.minimal,
      signal,
      120,
      {
        separatorStyle: "slash",
        signal: getStructuralPreset("lanternwake").signal,
        ascii: true,
      },
    );

    assert.match(result.topContent, /contrib-ok/);
    assert.doesNotMatch(result.topContent, /\x1b\[31m\s+\x1b\[0m/);
    assert.doesNotMatch(result.topContent, /\x1b\[2K/);
    assert.doesNotMatch(result.topContent, /\x1b\]0;hidden\x07/);
  } finally {
    clearContributions();
  }
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

test("rail wake trails the head on both ping-pong legs", () => {
  const spec = getStructuralPreset("lanternwake").signal;
  const signal = createSignalRuntime(0);
  signal.event = "streaming";
  signal.motionId = "braille-wave"; // frames-kind signal motion
  signal.activity = "streaming";
  signal.active = true;
  // width 80 -> rail of 12 cells, span 11, period 22.
  const cells = (tick: number) => {
    signal.tick = tick;
    const rail = stripAnsi(renderActivity(signal, spec, false, 80));
    return rail.slice(rail.indexOf("╾") + 1, rail.lastIndexOf("╼"));
  };
  const braille = /[⠁-⠿]/;
  // Outbound (tick 4): head travels right, wake to its left.
  const out = cells(4);
  const outHead = out.indexOf("⠷"); // frameAt(braille-wave, 4)
  assert.notEqual(outHead, -1, `head frame missing: ${out}`);
  assert.ok(braille.test(out.slice(0, outHead)), `outbound wake must sit left of the head: ${out}`);
  assert.match(out.slice(outHead + 1), /^─+$/, `nothing ahead on the outbound leg: ${out}`);
  // Return leg (tick 15 > span 11): head travels left, wake to its right.
  const back = cells(15);
  const backHead = back.indexOf("⠧"); // frameAt(braille-wave, 15)
  assert.notEqual(backHead, -1, `head frame missing: ${back}`);
  assert.match(back.slice(0, backHead), /^─+$/, `nothing ahead on the return leg: ${back}`);
  assert.ok(braille.test(back.slice(backHead + 1)), `return wake must sit right of the head: ${back}`);
});
