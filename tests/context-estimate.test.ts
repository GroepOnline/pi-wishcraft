import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createRuntimeState } from "../src/extension/core/state.ts";
import { registerSessionLifecycle } from "../src/extension/session/session-lifecycle.ts";
import { renderSegment } from "../src/segments/index.ts";
import type { SegmentContext } from "../src/config/types.ts";
import {
  estimateUnknownContextUsage,
  resolveDisplayContextUsage,
} from "../src/usage/context.ts";

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

function fakePi() {
  const handlers = new Map<string, Array<(event: any, ctx: any) => unknown>>();
  return {
    handlers,
    on(event: string, handler: (event: any, ctx: any) => unknown) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
  };
}

function makeUsage(
  input: number,
  output: number,
  cacheRead = 0,
  cacheWrite = 0,
) {
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    cost: { total: (input + output + cacheRead + cacheWrite) * 0.001 },
  };
}

function assistantMessage(
  usage = makeUsage(900, 40),
  stopReason = "stop",
) {
  return {
    role: "assistant",
    content: [{ type: "text", text: "ok" }],
    usage,
    stopReason,
  };
}

/**
 * Compaction session entry in the shape pi-coding-agent writes: the current
 * system message is persisted on the entry and sessionEntryToContextMessages
 * yields it back ahead of the summary.
 */
function compactionEntry(systemMessage?: unknown) {
  return {
    type: "compaction",
    id: "c1",
    parentId: null,
    timestamp: "2026-01-01T00:00:00.000Z",
    summary: "x".repeat(400),
    firstKeptEntryId: "c1",
    tokensBefore: 50000,
    ...(systemMessage ? { systemMessage } : {}),
  };
}

function userMessageEntry(text = "hi") {
  return {
    type: "message",
    id: "m1",
    parentId: null,
    timestamp: "2026-01-01T00:00:00.000Z",
    message: {
      role: "user",
      content: [{ type: "text", text }],
      timestamp: 0,
    },
  };
}

/** ctx in the post-compaction gap: window known, tokens still null. */
function estimateCtx(entries: unknown[], contextWindow = 100000) {
  return {
    cwd: "/tmp",
    hasUI: false,
    model: { id: "m", contextWindow },
    sessionManager: {
      getLeafId: () => "leaf-1",
      getBranch: () => [],
      getSessionId: () => "s1",
      buildContextEntries: () => entries,
    },
    getContextUsage: () => ({
      tokens: null,
      contextWindow,
      percent: null,
    }),
    getSystemPrompt: () => "s".repeat(4000),
    ui: { notify() {} },
  };
}

// ── estimateUnknownContextUsage ─────────────────────────────────────────────

test("estimateUnknownContextUsage counts the persisted system message once", () => {
  const systemMessage = {
    role: "system",
    content: "s".repeat(4000), // ≈1000 tokens at the chars/4 heuristic
    timestamp: 0,
  };
  const estimate = estimateUnknownContextUsage(
    estimateCtx([compactionEntry(systemMessage)]),
  );
  assert.ok(estimate);
  // 1000 (system message) + 100 (compaction summary). getSystemPrompt() must
  // not add a second ~1000 on top of the SDK-provided message.
  assert.equal(estimate.contextTokens, 1100);
  assert.equal(estimate.contextWindow, 100000);
});

test("estimateUnknownContextUsage falls back to getSystemPrompt only without a system message", () => {
  // Compaction entries written before systemMessage persistence (or sessions
  // whose branch carries none) still need the prompt estimated separately.
  const noSystem = estimateUnknownContextUsage(
    estimateCtx([compactionEntry()]),
  );
  assert.ok(noSystem);
  assert.equal(noSystem.contextTokens, 1100); // 100 summary + 1000 prompt fallback

  const userOnly = estimateUnknownContextUsage(
    estimateCtx([userMessageEntry("hi")]),
  );
  assert.ok(userOnly);
  assert.equal(userOnly.contextTokens, 1001); // 1 user token + 1000 prompt fallback
});

test("estimateUnknownContextUsage returns null once Pi reports real tokens", () => {
  const ctx = estimateCtx([compactionEntry()]);
  ctx.getContextUsage = () => ({
    tokens: 5000,
    contextWindow: 100000,
    percent: 5,
  });
  assert.equal(estimateUnknownContextUsage(ctx), null);
});

test("estimateUnknownContextUsage returns null without a usable context window", () => {
  const ctx = estimateCtx([compactionEntry()], 0);
  assert.equal(estimateUnknownContextUsage(ctx), null);
});

// ── resolveDisplayContextUsage ordering ─────────────────────────────────────

test("resolveDisplayContextUsage prefers real core tokens over the estimate", () => {
  const estimate = {
    contextTokens: 1100,
    contextWindow: 100000,
    contextPercent: 1.1,
  };
  const real = {
    contextTokens: 3200,
    contextWindow: 100000,
    contextPercent: 3.2,
  };

  assert.equal(
    resolveDisplayContextUsage({
      coreContextUsage: real,
      unknownCoreFallback: estimate,
      fallbackContextTokens: 940,
      fallbackContextWindow: 100000,
    }),
    real,
  );

  // A null-token core reading is covered by the estimate …
  assert.equal(
    resolveDisplayContextUsage({
      coreContextUsage: {
        contextTokens: null,
        contextWindow: 100000,
        contextPercent: null,
      },
      unknownCoreFallback: estimate,
      fallbackContextTokens: 940,
      fallbackContextWindow: 100000,
    }),
    estimate,
  );

  // … and while streaming the caller passes core=null, so the estimate still
  // wins until a real usage event clears it.
  assert.equal(
    resolveDisplayContextUsage({
      coreContextUsage: null,
      unknownCoreFallback: estimate,
      fallbackContextTokens: 940,
      fallbackContextWindow: 100000,
    }),
    estimate,
  );

  // Once cleared, the live assistant usage fills the bar instead.
  const live = resolveDisplayContextUsage({
    coreContextUsage: null,
    unknownCoreFallback: null,
    fallbackContextTokens: 940,
    fallbackContextWindow: 100000,
  });
  assert.equal(live?.contextTokens, 940);
  assert.equal(live?.contextWindow, 100000);
  assert.ok(Math.abs((live?.contextPercent ?? 0) - 0.94) < 1e-9);
});

// ── lifecycle: the estimate invalidates on real usage ───────────────────────

test("message_end replaces the post-compaction estimate with real usage", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wishcraft-estimate-"));
  const prevAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = dir;
  try {
    const rt = createRuntimeState({});
    const pi = fakePi();
    registerSessionLifecycle(pi as never, rt);
    const ctx = estimateCtx([compactionEntry()]);

    const compact = pi.handlers.get("session_compact")?.[0];
    assert.ok(compact);
    await compact({ willRetry: true }, ctx);
    assert.ok(rt.approximateContextUsage);

    const messageEnd = pi.handlers.get("message_end")?.[0];
    assert.ok(messageEnd);
    const message = assistantMessage(makeUsage(900, 40));
    await messageEnd({ message }, ctx);

    assert.equal(rt.approximateContextUsage, null);
    assert.equal(rt.liveAssistantUsage, message.usage);
  } finally {
    if (prevAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = prevAgentDir;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("message_update clears the estimate while the first post-compact response streams", async () => {
  const rt = createRuntimeState({});
  const pi = fakePi();
  registerSessionLifecycle(pi as never, rt);
  const ctx = estimateCtx([compactionEntry()]);

  const compact = pi.handlers.get("session_compact")?.[0];
  assert.ok(compact);
  await compact({ willRetry: true }, ctx);
  assert.ok(rt.approximateContextUsage);

  rt.isStreaming = true;
  const update = pi.handlers.get("message_update")?.[0];
  assert.ok(update);
  const message = assistantMessage(makeUsage(900, 40), "streaming");
  await update({ message }, ctx);

  assert.equal(rt.approximateContextUsage, null);
  assert.equal(rt.liveAssistantUsage, message.usage);
});

test("events without real context usage do not clear the estimate", async () => {
  const rt = createRuntimeState({});
  const pi = fakePi();
  registerSessionLifecycle(pi as never, rt);
  const ctx = estimateCtx([compactionEntry()]);

  const compact = pi.handlers.get("session_compact")?.[0];
  assert.ok(compact);
  await compact({ willRetry: true }, ctx);
  const estimate = rt.approximateContextUsage;
  assert.ok(estimate);

  // turn boundaries, tool calls, non-assistant messages and failed responses
  // observe nothing about the real context size — the estimate must survive.
  const turnEnd = pi.handlers.get("turn_end")?.[0];
  assert.ok(turnEnd);
  await turnEnd({ turnIndex: 0 }, ctx);

  const toolCall = pi.handlers.get("tool_call")?.[0];
  assert.ok(toolCall);
  await toolCall({ toolName: "read", input: { path: "/tmp/x" } }, ctx);

  const messageEnd = pi.handlers.get("message_end")?.[0];
  assert.ok(messageEnd);
  await messageEnd(
    {
      message: {
        role: "user",
        content: [{ type: "text", text: "hi" }],
      },
    },
    ctx,
  );
  await messageEnd(
    { message: assistantMessage(makeUsage(100, 10), "error") },
    ctx,
  );

  assert.equal(rt.approximateContextUsage, estimate);
});

test("compact boundaries still clear the estimate", async () => {
  const rt = createRuntimeState({});
  const pi = fakePi();
  registerSessionLifecycle(pi as never, rt);
  const ctx = estimateCtx([compactionEntry()]);

  const compact = pi.handlers.get("session_compact")?.[0];
  assert.ok(compact);
  await compact({ willRetry: true }, ctx);
  assert.ok(rt.approximateContextUsage);

  const beforeCompact = pi.handlers.get("session_before_compact")?.[0];
  assert.ok(beforeCompact);
  await beforeCompact({}, ctx);
  assert.equal(rt.approximateContextUsage, null);

  rt.powerlineCompacting = false;
  await compact({ willRetry: true }, ctx);
  assert.ok(rt.approximateContextUsage);

  const compactFailed = pi.handlers.get("session_compact_failed")?.[0];
  assert.ok(compactFailed);
  await compactFailed({}, ctx);
  assert.equal(rt.approximateContextUsage, null);
});

// ── ~/? display semantics ───────────────────────────────────────────────────

function segmentCtx(overrides: Partial<SegmentContext>): SegmentContext {
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
    contextTokens: null,
    contextPercent: null,
    contextApproximate: false,
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
    effectiveCustomItems: [],
    options: {},
    segmentLabels: new Map(),
    theme: {
      fg: (_c: string, t: string) => t,
      bg: (_c: string, t: string) => t,
      bold: (t: string) => t,
    } as never,
    colors: {},
    ...overrides,
  };
}

test("context_pct marks the estimate with ~ and unknown context with ?", () => {
  const approximate = segmentCtx({
    contextTokens: 1100,
    contextPercent: 1.1,
    contextWindow: 100000,
    contextApproximate: true,
  });
  assert.equal(
    stripAnsi(renderSegment("context_pct", approximate).content),
    "◫ ~1.1k/100k (1.1%) AC ░░░░░░░░",
  );

  const measured = segmentCtx({
    contextTokens: 1100,
    contextPercent: 1.1,
    contextWindow: 100000,
    contextApproximate: false,
  });
  assert.equal(
    stripAnsi(renderSegment("context_pct", measured).content),
    "◫ 1.1k/100k (1.1%) AC ░░░░░░░░",
  );

  const unknown = segmentCtx({ contextWindow: 100000 });
  assert.equal(
    stripAnsi(renderSegment("context_pct", unknown).content),
    "◫ ?/100k",
  );
});
