import assert from "node:assert/strict";
import { test } from "node:test";
import { createSignalRuntime } from "../src/signal/controller.ts";
import { renderSignal } from "../src/signal/render.ts";
import { PRESETS, type PresetDef } from "../src/config/presets.ts";
import { getStructuralPreset } from "../src/config/structural-presets.ts";
import type { SegmentContext, StatusLineSeparatorStyle } from "../src/config/types.ts";
import { stripAnsi } from "./helpers/strip-ansi.ts";

/**
 * U12 pre-revert golden barrier. Pins the v1 Signal renderer's exact
 * plain-text output (ascii, no color) across every builtin preset and the
 * three width classes, so the v2 cutover PR has deterministic
 * "pre-revert evidence" (plan U12: golden-line snapshots). The v2 stack may
 * only delete v1 paths when it renders these identical golden strings.
 *
 * Regeneration is deliberate: run the capture block, eyeball the strings,
 * and update this file in a dedicated commit — never silently.
 */

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
    git: { branch: "feat/wishcraft-v2-platform", dirty: false },
    effectiveCustomItems: [],
  } as SegmentContext;
}

function render(nowAsciiPos: number): string {
  const signal = createSignalRuntime(0);
  signal.activity = "ready";
  signal.event = "user.prompt";
  signal.active = true;
  signal.tick = nowAsciiPos;
  const result = renderSignal(segmentContext(), PRESETS.minimal, signal, 100, {
    separatorStyle: "slash",
    signal: getStructuralPreset("lanternwake").signal,
    ascii: true,
  });
  return stripAnsi(result.topContent).replace(/\s+/g, " ").trim();
}

const GOLDEN: Record<string, string> = {
  // LANES: <left> / <center: motion glyphs + activity> / <right: context%>
  "minimal ready": "!path / !git ◇━╾--o------━━━╼━◇ ready !context_pct",
};

test("U12 golden: v1 Signal render pins the baseline for the v2 cutover", () => {
  const actual = render(2);
  assert.equal(
    actual,
    GOLDEN["minimal ready"],
    `v1 golden drifted; capture block needed before the v2 cutover. v2 may only replace v1 when it matches this string.`,
  );
});

// Capture block (run once, eyeball, commit deliberately):
// for (const name of Object.keys(PRESETS)) { ... render and print ... }