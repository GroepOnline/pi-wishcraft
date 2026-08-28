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

  // Non-ASCII: 3-row lantern sigil (lanternwake + streaming falls to the
  // sigil branch). The 1-row directional comet was retired in favour of
  // the multi-row sigil — the new visual contract.
  const rail = stripAnsi(renderActivity(signal, spec, false));
  const lines = rail.split("\n");
  assert.equal(lines.length, 3, "sigil must be 3 rows");
  assert.match(lines[0]!, /streaming/);
  assert.match(lines[0]!, /[⣀⣤⣶⣿]/);
  // ASCII fallback: 1-row comet, no honest sigil at 12 cols.
  assert.match(stripAnsi(renderActivity(signal, spec, true)), /o/);
  const asciiRail = stripAnsi(renderActivity(signal, spec, true));
  assert.match(asciiRail, /streaming/);
  const trailBehind = asciiRail.indexOf("o") > asciiRail.indexOf(">");
  assert.ok(trailBehind, "ASCII trail must trail the head");
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
