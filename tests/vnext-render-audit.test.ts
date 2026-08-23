/**
 * Inspect real rendered strings for the vNext claims: three-lane Signal,
 * travelling vs still rail, Deck frame, workbench split, and a11y fallbacks.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { PRESETS } from "../src/config/presets.ts";
import { getStructuralPreset } from "../src/config/structural-presets.ts";
import { DEFAULT_SHORTCUTS } from "../src/extension/core/constants.ts";
import { renderDeckFrame } from "../src/extension/ui/deck/render.ts";
import type { DeckNavState, DeckSessionSnapshot } from "../src/extension/ui/deck/types.ts";
import { DECK_ROUTES } from "../src/extension/ui/deck/types.ts";
import { renderSkillWorkbench } from "../src/extension/skills/workbench.ts";
import { DEFAULT_MOTION_POLICY } from "../src/motion/index.ts";
import { createSignalRuntime } from "../src/signal/controller.ts";
import { renderActivity, renderSignal } from "../src/signal/render.ts";
import { renderRailSweep } from "../src/signal/rail.ts";
import type { SegmentContext } from "../src/config/types.ts";

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

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
      branch: "main",
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

const snapshot: DeckSessionSnapshot = {
  modelLabel: "GPT-5.6",
  branchLabel: "main",
  contextPercent: 47,
  contextTokens: 94000,
  contextWindow: 200000,
  signalActivity: "streaming",
  signalMotion: "ember-relay",
  queueCount: 1,
  ideaCount: 4,
  skillsTotal: 2,
  skillsWarnings: 0,
  policyEnabled: true,
  policyRuleCount: 1,
  shellName: "bash",
  bashModeActive: false,
  appearanceBase: "lanternwake",
  recentActivity: ["read_file"],
  nextIntent: "Inspect Signal rail",
  skillSummaries: [
    {
      name: "wishcraft-tui",
      description: "Deck and Signal contracts",
      category: "project",
      usageCount: 3,
      usageSeries: [1, 2, 3],
      bodyPreview: "Use for Deck, Signal, and motion work.",
      health: "ok",
      triggers: ["wishcraft-tui", "$wishcraft-tui"],
    },
  ],
};

const nav: DeckNavState = {
  route: "home",
  selectedNav: 0,
  searchOpen: false,
  searchQuery: "",
  pendingJump: null,
};

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
};

test("rendered Signal has three lanes and a travelling rail that freezes when idle", () => {
  const runtime = createSignalRuntime(0);
  runtime.event = "streaming";
  runtime.activity = "streaming";
  runtime.active = true;
  runtime.tick = 3;
  const spec = getStructuralPreset("lanternwake").signal;
  const live = stripAnsi(
    renderSignal(segmentContext(), PRESETS.minimal, runtime, 100, {
      separatorStyle: "slash",
      signal: spec,
      ascii: true,
      color: false,
    }).topContent,
  );
  assert.match(live, /project/);
  assert.match(live, /streaming/);
  assert.match(live, /47%/);
  assert.ok(live.indexOf("project") < live.indexOf("streaming"));
  assert.ok(live.indexOf("streaming") < live.indexOf("47%"));
  assert.match(live, /◇-+?\*-+-?◇|---\*/);

  const moving = renderRailSweep({ tick: 0, width: 10, animating: true, ascii: true });
  const moved = renderRailSweep({ tick: 4, width: 10, animating: true, ascii: true });
  const still = renderRailSweep({ tick: 4, width: 10, animating: false, ascii: true });
  assert.notEqual(moving, moved);
  assert.equal(still, "----------");
  assert.equal(moving.length, 10);
});

test("rendered Deck is one continuous frame on every route", () => {
  for (const route of DECK_ROUTES) {
    const lines = renderDeckFrame(
      theme as never,
      88,
      snapshot,
      { ...nav, route },
      DEFAULT_SHORTCUTS,
    );
    assert.match(lines[0] ?? "", /╭/);
    assert.match(lines.at(-1) ?? "", /╯/);
    assert.ok(lines.every((line) => visibleWidth(line) === 88), route);
  }
  const skills = renderDeckFrame(
    theme as never,
    96,
    snapshot,
    { ...nav, route: "skills" },
    DEFAULT_SHORTCUTS,
  ).join("\n");
  assert.match(skills, /SKILLS/);
  assert.match(skills, /METADATA/);
  assert.match(skills, /PREVIEW/);
  assert.match(skills, /Use for Deck/);
  assert.match(skills, /wishcraft-tui/);
  assert.match(skills, /discover\(project\)/);
  assert.match(skills, /enter insert/);
});

test("rendered workbench and a11y fallbacks change the actual output", () => {
  const workbench = renderSkillWorkbench(
    theme as never,
    90,
    snapshot.skillSummaries ?? [],
    0,
    null,
  ).join("\n");
  assert.match(workbench, /wishcraft-tui/);
  assert.match(workbench, /enter insert/);

  const runtime = createSignalRuntime(0);
  runtime.event = "streaming";
  runtime.activity = "streaming";
  runtime.active = true;
  const spec = getStructuralPreset("lanternwake").signal;
  const off = stripAnsi(
    renderActivity(runtime, spec, true, { ...DEFAULT_MOTION_POLICY, level: "off" }),
  );
  const fullA = stripAnsi(
    renderActivity({ ...runtime, tick: 1 }, spec, true, DEFAULT_MOTION_POLICY),
  );
  const fullB = stripAnsi(
    renderActivity({ ...runtime, tick: 4 }, spec, true, DEFAULT_MOTION_POLICY),
  );
  assert.notEqual(fullA, fullB);
  assert.equal(
    off,
    stripAnsi(renderActivity({ ...runtime, tick: 9 }, spec, true, { ...DEFAULT_MOTION_POLICY, level: "off" })),
  );

  const reader = renderSignal(segmentContext(), PRESETS.minimal, runtime, 80, {
    separatorStyle: "slash",
    signal: spec,
    policy: { ...DEFAULT_MOTION_POLICY, screenReader: true },
  });
  assert.equal(
    reader.topContent,
    "Model: GPT-5.6 | Git: main (clean) | State: streaming | Context: 47%",
  );
});
