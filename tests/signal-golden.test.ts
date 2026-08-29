import assert from "node:assert/strict";
import { test } from "node:test";
import { createSignalRuntime } from "../src/signal/controller.ts";
import { renderStatusLineV2 } from "../src/render/v2-entry.ts";
import { PRESETS, type PresetDef } from "../src/config/presets.ts";
import { getStructuralPreset } from "../src/config/structural-presets.ts";
import type { SegmentContext, StatusLineSeparatorStyle } from "../src/config/types.ts";
import { stripAnsi } from "./helpers/strip-ansi.ts";

/**
 * U12 post-cutover golden. Pins the v2 render entry's exact plain-text
 * output (ascii, no color) for the minimal preset, so any drift in the
 * single render path (v2-entry -> computeLaneLayout -> paintLayout) fails
 * loudly. The PRE-cutover v1 baseline lives in git history at 84b2e2a
 * ("!path / !git ◇━╾--o------━━━╼━◇ ready !context_pct"); the deliberate
 * v1->v2 delta is the styled separator joining every primary segment.
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
  const result = renderStatusLineV2(segmentContext(), PRESETS.minimal, signal, 100, {
    separatorStyle: "slash",
    signal: getStructuralPreset("lanternwake").signal,
    ascii: true,
  });
  return stripAnsi(result.topContent).replace(/\s+/g, " ").trim();
}

const GOLDEN: Record<string, string> = {
  // Single primary lane joined by the styled separator; directional comet rail
  // (fixed ● head, box-drawing trail behind only, light ─ track, no caps).
  "minimal ready": "!path / !git / ◇━╾>=o---------╼━◇ ready / !context_pct",
};

test("U12 golden: v2 render entry pins the post-cutover baseline", () => {
  const actual = render(2);
  assert.equal(
    actual,
    GOLDEN["minimal ready"],
    `v2 golden drifted. The single render path (v2-entry) must reproduce this string; if a change is intentional, re-pin deliberately.`,
  );
});

// Capture block (run once, eyeball, commit deliberately):
// for (const name of Object.keys(PRESETS)) { ... render and print ... }