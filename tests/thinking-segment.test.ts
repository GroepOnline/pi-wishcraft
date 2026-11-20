import test from "node:test";
import assert from "node:assert/strict";
import { renderSegment } from "../src/segments/index.ts";
import type {
  ColorScheme,
  SegmentContext,
  ThemeLike,
} from "../src/config/types.ts";

function hexAnsi(hex: `#${string}`): string {
  const value = hex.slice(1);
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

function createSegmentContext(
  thinkingLevel: string,
  colors: ColorScheme,
): SegmentContext {
  return {
    model: undefined,
    thinkingLevel,
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
    git: { branch: null, staged: 0, unstaged: 0, untracked: 0 },
    extensionStatuses: new Map(),
    hiddenExtensionStatusKeys: new Set(),
    customItemsById: new Map(),
    options: {},
    segmentLabels: new Map(),
    theme: {
      fg() {
        throw new Error(
          "unexpected theme color lookup in thinking segment test",
        );
      },
    } satisfies ThemeLike,
    colors,
  };
}

test("thinking segment uses per-level colors for off through medium", () => {
  const colors: ColorScheme = {
    thinking: "#111111",
    thinkingMinimal: "#222222",
    thinkingLow: "#333333",
    thinkingMedium: "#444444",
  };

  const off = renderSegment("thinking", createSegmentContext("off", colors));
  const minimal = renderSegment(
    "thinking",
    createSegmentContext("minimal", colors),
  );
  const low = renderSegment("thinking", createSegmentContext("low", colors));
  const medium = renderSegment(
    "thinking",
    createSegmentContext("medium", colors),
  );

  assert.equal(off.content, `${hexAnsi("#111111")}think:off\x1b[0m`);
  assert.equal(minimal.content, `${hexAnsi("#222222")}think:min\x1b[0m`);
  assert.equal(low.content, `${hexAnsi("#333333")}think:low\x1b[0m`);
  assert.equal(medium.content, `${hexAnsi("#444444")}think:med\x1b[0m`);
});

test("thinking segment paints high through max as a rainbow by default", () => {
  for (const level of ["high", "xhigh", "max"]) {
    const rendered = renderSegment(
      "thinking",
      createSegmentContext(level, {}),
    );
    assert.equal(rendered.visible, true);
    const plain = rendered.content.replace(/\x1b\[[0-9;]*m/g, "");
    assert.equal(plain, `think:${level}`);
    assert.ok(rendered.content.includes("\x1b[38;2;"), "expected rainbow RGB sequences");
  }
});

test("explicit colors.thinking outranks the rainbow default on high levels", () => {
  const colors: ColorScheme = { thinking: "#111111" };

  for (const level of ["high", "xhigh", "max"]) {
    const rendered = renderSegment(
      "thinking",
      createSegmentContext(level, colors),
    );
    assert.equal(
      rendered.content,
      `${hexAnsi("#111111")}think:${level}\x1b[0m`,
    );
  }
});

test("an explicit level color still wins over colors.thinking", () => {
  const colors: ColorScheme = {
    thinking: "#111111",
    thinkingHigh: "#ff0000",
  };

  const high = renderSegment("thinking", createSegmentContext("high", colors));
  assert.equal(high.content, `${hexAnsi("#ff0000")}think:high\x1b[0m`);

  const max = renderSegment("thinking", createSegmentContext("max", colors));
  assert.equal(max.content, `${hexAnsi("#111111")}think:max\x1b[0m`);
});
