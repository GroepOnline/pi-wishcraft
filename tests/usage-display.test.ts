import test from "node:test";
import assert from "node:assert/strict";
import { renderSegment } from "../src/segments/index.ts";
import {
  mergeSegmentOptions,
  parsePowerlineConfig,
} from "../src/config/powerline-config.ts";
import { PRESETS } from "../src/config/presets.ts";
import {
  BUILTIN_STATUS_LINE_SEGMENT_IDS,
  type SegmentContext,
  type StatusLineSegmentOptions,
} from "../src/config/types.ts";

const PRESET_NAMES = ["default", "compact"];

const originalNerdFonts = process.env.POWERLINE_NERD_FONTS;
process.env.POWERLINE_NERD_FONTS = "0";

test.after(() => {
  if (originalNerdFonts === undefined) {
    delete process.env.POWERLINE_NERD_FONTS;
  } else {
    process.env.POWERLINE_NERD_FONTS = originalNerdFonts;
  }
});

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function plainTheme(): any {
  return {
    fg: (_color: string, text: string) => text,
    bg: (_color: string, text: string) => text,
    bold: (text: string) => text,
  };
}

function createSegmentContext(
  options: StatusLineSegmentOptions = {},
  overrides: Partial<SegmentContext> = {},
): SegmentContext {
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
    queueSummary: {
      queueCount: 0,
      ideaCount: 0,
      blockedCount: 0,
      compacting: false,
      leadingText: null,
      leadingIntent: null,
      leadingStatus: null,
    },
    sessionStartTime: Date.now(),
    shellModeActive: false,
    shellRunning: false,
    shellName: null,
    shellCwd: null,
    git: { branch: null, staged: 0, unstaged: 0, untracked: 0 },
    extensionStatuses: new Map(),
    hiddenExtensionStatusKeys: new Set(),
    customItemsById: new Map(),
    options,
    segmentLabels: new Map(),
    theme: plainTheme(),
    colors: {},
    ...overrides,
  };
}

// ── context_pct format ──────────────────────────────────────────────────────

test("context_pct defaults to the full tokens/window rendering", () => {
  const ctx = createSegmentContext(
    {},
    {
      contextTokens: 12300,
      contextWindow: 200000,
      contextPercent: 6.15,
    },
  );

  const rendered = renderSegment("context_pct", ctx);
  assert.equal(stripAnsi(rendered.content), "◫ 12k/200k (6.2%) AC ░░░░░░░░");
});

test("context_pct percent format renders a bare rounded percentage", () => {
  const ctx = createSegmentContext(
    { context: { format: "percent" } },
    {
      contextTokens: 12300,
      contextWindow: 200000,
      contextPercent: 6.15,
    },
  );

  const rendered = renderSegment("context_pct", ctx);
  assert.equal(stripAnsi(rendered.content), "6%");
});

test("context_pct percent format keeps threshold colors and drops icons", () => {
  for (const [percent, expected] of [
    [69, "69%"],
    [85, "85%"],
    [95, "95%"],
  ] as const) {
    const ctx = createSegmentContext(
      { context: { format: "percent" } },
      {
        contextTokens: percent,
        contextWindow: 100,
        contextPercent: percent,
      },
    );
    const rendered = renderSegment("context_pct", ctx);
    assert.equal(stripAnsi(rendered.content), expected);
    assert.ok(
      !rendered.content.includes("◫"),
      "no context icon in percent mode",
    );
    assert.ok(
      !rendered.content.includes("AC"),
      "no auto-compact icon in percent mode",
    );
  }
});

// ── cache_read format ───────────────────────────────────────────────────────

test("cache_read defaults to raw token count", () => {
  const ctx = createSegmentContext(
    {},
    {
      usageStats: {
        input: 1000,
        output: 0,
        cacheRead: 12300,
        cacheWrite: 0,
        cost: 0,
        subagentCost: 0,
      },
    },
  );

  const rendered = renderSegment("cache_read", ctx);
  assert.equal(stripAnsi(rendered.content), "cache in: 12k");
});

test("cache_read percent format renders the cache hit rate", () => {
  const ctx = createSegmentContext(
    { cache_read: { format: "percent" } },
    {
      usageStats: {
        input: 2000,
        output: 0,
        cacheRead: 8000,
        cacheWrite: 0,
        cost: 0,
        subagentCost: 0,
      },
    },
  );

  const rendered = renderSegment("cache_read", ctx);
  assert.equal(stripAnsi(rendered.content), "cache 80%");
});

test("cache_read both format renders raw token count and cache hit rate", () => {
  const ctx = createSegmentContext(
    { cache_read: { format: "both" } },
    {
      usageStats: {
        input: 2000,
        output: 0,
        cacheRead: 8000,
        cacheWrite: 0,
        cost: 0,
        subagentCost: 0,
      },
    },
  );

  const rendered = renderSegment("cache_read", ctx);
  assert.equal(stripAnsi(rendered.content), "cache in: 8.0k (80%)");
});

test("cache_read percent and both formats handle zero input without NaN", () => {
  const percentCtx = createSegmentContext(
    { cache_read: { format: "percent" } },
    {
      usageStats: {
        input: 0,
        output: 0,
        cacheRead: 5,
        cacheWrite: 0,
        cost: 0,
        subagentCost: 0,
      },
    },
  );
  assert.equal(
    stripAnsi(renderSegment("cache_read", percentCtx).content),
    "cache 100%",
  );

  const bothCtx = createSegmentContext(
    { cache_read: { format: "both" } },
    {
      usageStats: {
        input: 0,
        output: 0,
        cacheRead: 5,
        cacheWrite: 0,
        cost: 0,
        subagentCost: 0,
      },
    },
  );
  assert.equal(
    stripAnsi(renderSegment("cache_read", bothCtx).content),
    "cache in: 5 (100%)",
  );

  const hidden = createSegmentContext({ cache_read: { format: "both" } });
  assert.deepEqual(renderSegment("cache_read", hidden), {
    content: "",
    visible: false,
  });
});

// ── queue segment ──────────────────────────────────────────────────────────

// ── budget segment ───────────────────────────────────────────────────────

test("budget segment renders daily usage with a fill bar when a limit is set", () => {
  const ctx = createSegmentContext(
    {},
    { tokenBudget: { dailyLimit: 100000, dailyUsed: 50000 } },
  );
  const rendered = renderSegment("budget", ctx);
  assert.equal(stripAnsi(rendered.content), "budget 50% ▓▓▓▓░░░░");
});

test("budget is a registered built-in used only by the full operational presets", () => {
  assert.ok(BUILTIN_STATUS_LINE_SEGMENT_IDS.includes("budget"));
  const presetsWithBudget = Object.entries(PRESETS)
    .filter(([, preset]) => preset.rightSegments?.includes("budget"))
    .map(([name]) => name)
    .sort();
  assert.deepEqual(presetsWithBudget, ["chef", "full", "nerd"]);
});

test("budget segment hides without a positive daily limit", () => {
  for (const tokenBudget of [
    undefined,
    { dailyLimit: null, dailyUsed: 10 },
    { dailyLimit: 0, dailyUsed: 10 },
    { dailyLimit: -100, dailyUsed: 10 },
  ]) {
    const rendered = renderSegment("budget", createSegmentContext({}, { tokenBudget }));
    assert.deepEqual(rendered, { content: "", visible: false });
  }
});

test("budget segment clamps negative usage to an empty zero-percent bar", () => {
  const ctx = createSegmentContext(
    {},
    { tokenBudget: { dailyLimit: 1000, dailyUsed: -50 } },
  );
  assert.equal(stripAnsi(renderSegment("budget", ctx).content), "budget 0% ░░░░░░░░");
});

test("budget segment clamps overspend at 100%", () => {
  const ctx = createSegmentContext(
    {},
    { tokenBudget: { dailyLimit: 1000, dailyUsed: 5000 } },
  );
  const content = stripAnsi(renderSegment("budget", ctx).content);
  assert.match(content, /budget 100%/);
  assert.ok(content.includes("▓▓▓▓▓▓▓▓"), "the fill bar must be fully spent");
});

test("budget bar follows the exact 80% warning and 100% error thresholds", () => {
  // Pin contextWarn/contextError to distinct hex colors so the exact ANSI
  // escape identifies which semantic the bar cells were painted with. The
  // bar emits `<color><reset><cells><reset>` — the escape right before the
  // filled cells names the semantic used for the bar run.
  const colors = { context: "#010203", contextWarn: "#123456", contextError: "#654321" };
  const normalBar = "\x1b[38;2;1;2;3m\x1b[0m▓";
  const warnBar = "\x1b[38;2;18;52;86m\x1b[0m▓";
  const errorBar = "\x1b[38;2;101;67;33m\x1b[0m▓";

  const renderAt = (dailyUsed: number) =>
    renderSegment(
      "budget",
      createSegmentContext({}, { tokenBudget: { dailyLimit: 1000, dailyUsed }, colors }),
    ).content;

  const belowWarning = renderAt(799);
  assert.ok(belowWarning.includes(normalBar), "below 80% the bar must keep its normal color");
  assert.ok(!belowWarning.includes(warnBar));

  const atWarning = renderAt(800);
  assert.ok(atWarning.includes(warnBar), "at 80% the bar must become warning-colored");
  assert.ok(!atWarning.includes(errorBar));

  const belowError = renderAt(999);
  assert.ok(belowError.includes(warnBar), "below 100% the bar must stay warning-colored");
  assert.ok(!belowError.includes(errorBar));

  const at100 = renderAt(1000);
  assert.ok(at100.includes(errorBar), "at 100% the bar must be error-colored");
});

// ── queue segment ─────────────────────────────────────────────────────────

test("queue segment hides when empty", () => {
  const ctx = createSegmentContext();
  assert.deepEqual(renderSegment("queue", ctx), {
    content: "",
    visible: false,
  });
});

test("queue segment summarizes queued ideas and blocked items", () => {
  const ctx = createSegmentContext(
    {},
    {
      queueSummary: {
        queueCount: 2,
        ideaCount: 3,
        blockedCount: 1,
        compacting: false,
        leadingText: "fix README",
        leadingIntent: "post-compact",
        leadingStatus: "blocked",
      },
    },
  );

  assert.equal(
    stripAnsi(renderSegment("queue", ctx).content),
    "q 2 · ideas 3 · blocked 1",
  );
});

test("queue segment highlights compaction-held prompts", () => {
  const ctx = createSegmentContext(
    {},
    {
      queueSummary: {
        queueCount: 1,
        ideaCount: 0,
        blockedCount: 0,
        compacting: true,
        leadingText: "run after compact",
        leadingIntent: "post-compact",
        leadingStatus: "queued",
      },
    },
  );

  assert.equal(stripAnsi(renderSegment("queue", ctx).content), "compact q 1");
});

// ── config parsing / merging ────────────────────────────────────────────────

test("parsePowerlineConfig accepts context and cache_read formats", () => {
  const config = parsePowerlineConfig(
    {
      context: { format: "percent" },
      cache_read: { format: "both" },
    },
    PRESET_NAMES,
  );

  assert.equal(config.segmentOptions.context?.format, "percent");
  assert.equal(config.segmentOptions.cache_read?.format, "both");
});

test("parsePowerlineConfig ignores invalid format values", () => {
  const config = parsePowerlineConfig(
    {
      context: { format: "bogus" },
      cache_read: { format: 42 },
    },
    PRESET_NAMES,
  );

  assert.equal(config.segmentOptions.context?.format, undefined);
  assert.equal(config.segmentOptions.cache_read?.format, undefined);
});

test("parsePowerlineConfig defaults to upstream rendering when options are absent", () => {
  const config = parsePowerlineConfig({}, PRESET_NAMES);
  assert.equal(config.segmentOptions.context, undefined);
  assert.equal(config.segmentOptions.cache_read, undefined);
});

test("mergeSegmentOptions merges context and cache_read per key", () => {
  const merged = mergeSegmentOptions(
    { context: { format: "percent" }, cache_read: { format: "percent" } },
    { context: { format: "full" }, cache_read: { format: "both" } },
  );

  assert.equal(merged.context?.format, "full");
  assert.equal(merged.cache_read?.format, "both");
});
