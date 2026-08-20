import test from "node:test";
import assert from "node:assert/strict";

import { parsePowerlineConfig } from "../src/config/powerline-config.ts";
import { getPreset } from "../src/config/presets.ts";
import type { SegmentContext } from "../src/config/types.ts";
import {
  buildConfigureItems,
  buildCustomPresetDef,
  buildCustomPresetSegmentIds,
  buildPresetEditorAddItems,
  buildSegmentDetailLines,
  buildSegmentItems,
  collectSegmentIds,
  segmentItemsToSelectItems,
  selectIndexForValue,
  validatePresetName,
} from "../src/extension/ui/menu-items.ts";

const PRESETS = ["chef"] as const;

function plainTheme() {
  return {
    fg: (_color: string, text: string) => text,
    bg: (_color: string, text: string) => text,
    bold: (text: string) => text,
  };
}

function createSegmentContext(
  overrides: Partial<SegmentContext> = {},
): SegmentContext {
  return {
    model: undefined,
    thinkingLevel: "off",
    sessionId: undefined,
    cwd: "/tmp/project",
    usageStats: {
      input: 100,
      output: 50,
      cacheRead: 25,
      cacheWrite: 5,
      cost: 0.5,
      subagentCost: 0.25,
    },
    contextTokens: 1200,
    contextPercent: 6,
    contextWindow: 20000,
    autoCompactEnabled: true,
    customCompactionEnabled: false,
    usingSubscription: false,
    queueSummary: {
      queueCount: 2,
      ideaCount: 1,
      blockedCount: 0,
      compacting: false,
      leadingText: "fix README",
      leadingIntent: "post-compact",
      leadingStatus: "queued",
    },
    sessionStartTime: Date.now(),
    shellModeActive: false,
    shellRunning: false,
    shellName: null,
    shellCwd: null,
    git: {
      branch: "main",
      staged: 1,
      unstaged: 2,
      untracked: 0,
      ahead: 1,
      behind: 0,
      commit: { short: "abc1234", subject: "feat: thing" },
    },
    extensionStatuses: new Map(),
    hiddenExtensionStatusKeys: new Set(),
    customItemsById: new Map(),
    effectiveCustomItems: [],
    options: {},
    segmentLabels: new Map(),
    theme: plainTheme(),
    colors: {},
    ...overrides,
  };
}

test("buildConfigureItems lists the configure sub-menu choices in order", () => {
  const items = buildConfigureItems();
  assert.equal(items[0], "Change preset");
  assert.equal(items[items.length - 1], "Show current config");
  assert.ok(items.includes("Toggle segment visibility…"));
  assert.ok(items.includes("Set segment label…"));
  assert.ok(items.includes("Build custom preset…"));
  assert.equal(items.length, 8);
});

test("collectSegmentIds keeps disabled segments so they can be re-enabled", () => {
  const config = parsePowerlineConfig(
    { preset: "chef", disabledSegments: ["git"] },
    PRESETS,
  );
  const ids = collectSegmentIds(config);
  assert.ok(ids.includes("git"), "disabled segment must stay in the toggle list");
  assert.ok(ids.includes("tps"));
  assert.ok(ids.includes("open_ports"));
});

test("segmentItemsToSelectItems maps items and falls back to __none__ when empty", () => {
  const items = segmentItemsToSelectItems([
    { id: "tps" as const, value: "0" },
  ]);
  assert.deepEqual(items, [{ label: "● tps  0", value: "tps" }]);

  const empty = segmentItemsToSelectItems([]);
  assert.deepEqual(empty, [{ label: "(no visible segments)", value: "__none__" }]);
});

test("buildSegmentItems skips disabled and hidden segments", () => {
  const config = parsePowerlineConfig(
    { preset: "chef", disabledSegments: ["git"] },
    PRESETS,
  );
  const items = buildSegmentItems(createSegmentContext(), config);

  assert.ok(items.length > 0);
  assert.ok(
    !items.some((item) => item.id === "git"),
    "disabled segment must not be navigable",
  );
  assert.ok(
    items.some((item) => item.id === "context_pct"),
    "visible context segment should be navigable",
  );
  for (const item of items) {
    assert.equal(typeof item.id, "string");
    assert.equal(typeof item.value, "string");
  }
});

test("buildSegmentDetailLines reports git branch, changes, upstream and head", () => {
  const lines = buildSegmentDetailLines("git", createSegmentContext());
  const byLabel = new Map(lines.map((line) => [line.label, line.value]));
  assert.equal(byLabel.get("segment"), "git");
  assert.equal(byLabel.get("branch"), "main");
  assert.equal(byLabel.get("changes"), "+1 ~2 ?0");
  assert.equal(byLabel.get("upstream"), "↑1 ↓0");
  assert.equal(byLabel.get("head"), "abc1234 feat: thing");
});

test("buildSegmentDetailLines sums cost and subagent cost", () => {
  const lines = buildSegmentDetailLines("cost", createSegmentContext());
  const byLabel = new Map(lines.map((line) => [line.label, line.value]));
  assert.equal(byLabel.get("cost"), "$0.50");
  assert.equal(byLabel.get("subagents"), "$0.25");
  assert.equal(byLabel.get("total"), "$0.75");
});

test("buildSegmentDetailLines reports context usage and queue summary", () => {
  const context = buildSegmentDetailLines(
    "context_pct",
    createSegmentContext(),
  );
  const byContext = new Map(context.map((line) => [line.label, line.value]));
  assert.equal(byContext.get("tokens"), "1200");
  assert.equal(byContext.get("window"), "20000");
  assert.equal(byContext.get("percent"), "6.0%");

  const queue = buildSegmentDetailLines("queue", createSegmentContext());
  const byQueue = new Map(queue.map((line) => [line.label, line.value]));
  assert.equal(byQueue.get("queued"), "2");
  assert.equal(byQueue.get("ideas"), "1");
  assert.equal(byQueue.get("next"), "fix README");
});

test("buildSegmentDetailLines honors the POWERLINE_TPS override", () => {
  const previous = process.env.POWERLINE_TPS;
  process.env.POWERLINE_TPS = "42";
  try {
    const lines = buildSegmentDetailLines("tps", createSegmentContext());
    const byLabel = new Map(lines.map((line) => [line.label, line.value]));
    assert.equal(byLabel.get("value"), "42 (override)");
  } finally {
    if (previous === undefined) delete process.env.POWERLINE_TPS;
    else process.env.POWERLINE_TPS = previous;
  }
});

test("buildSegmentDetailLines lists open-port processes in the detail view", () => {
  const lines = buildSegmentDetailLines("open_ports", createSegmentContext(), [
    { port: 3000, proto: "tcp", address: "0.0.0.0", process: "node (12345)" },
    { port: 53, proto: "udp", address: "127.0.0.53%lo", process: null },
  ]);
  const byLabel = new Map(lines.map((line) => [line.label, line.value]));
  assert.equal(byLabel.get("UDP"), "off");
  assert.equal(byLabel.get("tcp:3000"), "node (12345)");
  assert.equal(byLabel.get("udp:53"), "(unknown)");
});

test("buildSegmentDetailLines shows a placeholder when open-port owners are unavailable", () => {
  const lines = buildSegmentDetailLines("open_ports", createSegmentContext());
  const byLabel = new Map(lines.map((line) => [line.label, line.value]));
  assert.equal(byLabel.get("processes"), "(none / ss -p unavailable)");
});

test("buildSegmentDetailLines falls back to the rendered value for other segments", () => {
  const lines = buildSegmentDetailLines("time", createSegmentContext());
  const byLabel = new Map(lines.map((line) => [line.label, line.value]));
  assert.equal(byLabel.get("segment"), "time");
  assert.equal(typeof byLabel.get("value"), "string");
});

test("selectIndexForValue keeps the same segment selected across a refresh", () => {
  const items = [
    { label: "● tps  0", value: "tps" },
    { label: "● git  main", value: "git" },
    { label: "● cost  $0.00", value: "cost" },
  ];
  assert.equal(selectIndexForValue(items, "git"), 1);
  assert.equal(selectIndexForValue(items, null), 0);
  assert.equal(selectIndexForValue(items, "missing"), 0);
});

test("buildCustomPresetSegmentIds exposes built-ins, custom items, and computed segments", () => {
  const config = parsePowerlineConfig(
    {
      preset: "chef",
      customItems: [{ id: "ci", statusKey: "ci" }],
      segments: { widget: { type: "static", text: "hi" } },
    },
    PRESETS,
  );
  const ids = buildCustomPresetSegmentIds(config);
  assert.ok(ids.includes("model"));
  assert.ok(ids.includes("open_ports"));
  assert.ok(ids.includes("custom:ci"));
  assert.ok(ids.includes("custom:widget"));
});

test("validatePresetName lowercases and rejects invalid ids", () => {
  assert.equal(validatePresetName("My-Preset"), "my-preset");
  assert.equal(validatePresetName("chef_2"), "chef_2");
  assert.equal(validatePresetName("  OPS  "), "ops");
  assert.equal(validatePresetName("bad name"), null);
  assert.equal(validatePresetName("bad;name"), null);
  assert.equal(validatePresetName(""), null);
});

test("buildPresetEditorAddItems puts done first and excludes chosen ids", () => {
  const items = buildPresetEditorAddItems(["model", "git", "cost"], ["git"]);
  assert.equal(items[0].value, "__done__");
  assert.equal(items[0].label, "— done — (1 selected)");
  assert.deepEqual(
    items.map((item) => item.value),
    ["__done__", "model", "cost"],
  );
});

test("buildCustomPresetDef inherits base colors/options and omits empty secondary", () => {
  const base = getPreset("chef");
  const def = buildCustomPresetDef(base, ["model"], ["cost"], [], "pipe");
  assert.deepEqual(def.left, ["model"]);
  assert.deepEqual(def.right, ["cost"]);
  assert.equal(def.secondary, undefined);
  assert.equal(def.separator, "pipe");
  assert.ok(def.colors);
  assert.ok(def.segmentOptions);

  const withSecondary = buildCustomPresetDef(
    base,
    ["model"],
    ["cost"],
    ["extension_statuses"],
    "slash",
  );
  assert.deepEqual(withSecondary.secondary, ["extension_statuses"]);
});

test("buildSegmentDetailLines shows the fleet host in the open_ports detail", () => {
  const ctx = createSegmentContext({
    options: { openPorts: { host: "sofie", includeUdp: true } },
  });
  const lines = buildSegmentDetailLines("open_ports", ctx, []);
  const byLabel = new Map(lines.map((line) => [line.label, line.value]));
  assert.equal(byLabel.get("UDP"), "on");
  assert.equal(byLabel.get("host"), "sofie");
});
