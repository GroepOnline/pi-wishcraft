import test from "node:test";
import assert from "node:assert/strict";
import { renderSegment } from "../src/segments/index.ts";
import { resolvePreset, PRESETS } from "../src/config/presets.ts";
import type {
  ColorScheme,
  SegmentContext,
  ThemeLike,
} from "../src/config/types.ts";

function createSegmentContext(
  overrides: Partial<SegmentContext> = {},
): SegmentContext {
  const colors: ColorScheme = {
    gitClean: "#111111",
    gitDirty: "#111111",
    separator: "#222222",
    context: "#333333",
    cost: "#333333",
    queue: "#444444",
    tokens: "#555555",
  };
  return {
    model: undefined,
    thinkingLevel: "off",
    sessionId: undefined,
    usageStats: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
      subagentCost: 0,
    },
    contextTokens: 0,
    contextPercent: 0,
    contextWindow: 0,
    autoCompactEnabled: true,
    customCompactionEnabled: false,
    usingSubscription: false,
    sessionStartTime: Date.now(),
    shellModeActive: false,
    shellRunning: false,
    shellName: null,
    shellCwd: null,
    git: { branch: null, staged: 0, unstaged: 0, untracked: 0, ahead: 0, behind: 0, commit: null },
    extensionStatuses: new Map(),
    hiddenExtensionStatusKeys: new Set(),
    customItemsById: new Map(),
    options: {},
    segmentLabels: new Map(),
    theme: {
      fg() {
        throw new Error("unexpected theme color lookup in segment test");
      },
    } satisfies ThemeLike,
    colors,
    ...overrides,
  };
}

test("subagents segment shows subagent cost when present and hides when zero", () => {
  const hidden = renderSegment("subagents", createSegmentContext());
  assert.equal(hidden.visible, false);

  const ctx = createSegmentContext({
    usageStats: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
      subagentCost: 0.12,
    },
  });
  const rendered = renderSegment("subagents", ctx);
  assert.equal(rendered.visible, true);
  assert.match(rendered.content, /\$0\.12/);
  assert.match(rendered.content, /sub/);
});

test("git segment renders upstream ahead/behind and latest commit", () => {
  const ctx = createSegmentContext({
    git: {
      branch: "main",
      staged: 0,
      unstaged: 0,
      untracked: 0,
      ahead: 2,
      behind: 1,
      commit: { short: "abc1234", subject: "Fix things properly" },
    },
  });
  const rendered = renderSegment("git", ctx);
  assert.equal(rendered.visible, true);
  assert.match(rendered.content, /↑2 ↓1/);
  assert.match(rendered.content, /abc1234/);
  assert.match(rendered.content, /Fix things properly/);
});

test("git segment hides commit/ahead-behind when disabled", () => {
  const ctx = createSegmentContext({
    options: { git: { showCommit: false, showAheadBehind: false } },
    git: {
      branch: "main",
      staged: 0,
      unstaged: 0,
      untracked: 0,
      ahead: 5,
      behind: 3,
      commit: { short: "abc1234", subject: "Secret commit" },
    },
  });
  const rendered = renderSegment("git", ctx);
  assert.equal(rendered.visible, true);
  assert.doesNotMatch(rendered.content, /abc1234/);
  assert.doesNotMatch(rendered.content, /↑5|↓3/);
});

test("tps segment honors the POWERLINE_TPS override", () => {
  process.env.POWERLINE_TPS = "42";
  try {
    const rendered = renderSegment("tps", createSegmentContext());
    assert.equal(rendered.visible, true);
    assert.match(rendered.content, /42/);
  } finally {
    delete process.env.POWERLINE_TPS;
  }
});

test("resolvePreset warns once and falls back to default for unknown names", () => {
  assert.equal(resolvePreset("default"), PRESETS.default);
  assert.equal(resolvePreset("compact"), PRESETS.compact);

  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(String(args[0]));
  };
  try {
    // Unknown names resolve to default with exactly one warning each.
    assert.equal(resolvePreset("definitely-not-a-preset"), PRESETS.default);
    assert.equal(resolvePreset("definitely-not-a-preset"), PRESETS.default);
    // Inherited Object names (e.g. `toString`) must NOT be treated as presets.
    assert.equal(resolvePreset("toString"), PRESETS.default);
    assert.equal(resolvePreset("toString"), PRESETS.default);
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(warnings.length, 2);
});