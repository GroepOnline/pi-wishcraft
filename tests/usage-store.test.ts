import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  SessionUsageCache,
  type SessionTokenStats,
} from "../src/usage/ledger.ts";
import type { RuntimeState } from "../src/extension/core/types.ts";
import {
  billedSessionTotals,
  recordSessionUsageDelta,
} from "../src/extension/session/usage-recorder.ts";
import {
  appendUsageEvent,
  compactUsageFile,
  emptyUsageFile,
  formatUsageOverlayLines,
  parseUsageFile,
  recordUsageEvent,
  summarizeUsageOverlay,
  tokenTotal,
  USAGE_COMPACT_EVENT_LIMIT,
  type UsageEvent,
} from "../src/usage/usage-store.ts";

test("parseUsageFile returns empty on garbage", () => {
  assert.deepEqual(parseUsageFile(null), emptyUsageFile());
  assert.deepEqual(parseUsageFile("nope"), emptyUsageFile());
});

test("summarizeUsageOverlay splits session / today / week from one file", () => {
  const now = Date.parse("2026-08-20T12:00:00");
  const today = Date.parse("2026-08-20T08:00:00");
  const yesterday = Date.parse("2026-08-19T08:00:00");
  let file = emptyUsageFile();
  file = appendUsageEvent(
    file,
    {
      at: yesterday,
      input: 100,
      output: 50,
      cacheRead: 25,
      cacheWrite: 0,
      cost: 0.1,
      model: "old",
    },
    now,
  );
  file = appendUsageEvent(
    file,
    {
      at: today,
      input: 10,
      output: 5,
      cacheRead: 5,
      cacheWrite: 0,
      cost: 0.02,
      model: "new",
    },
    now,
  );
  const summary = summarizeUsageOverlay({
    file,
    session: {
      input: 3,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0.01,
    },
    now,
    dailyLimit: 200,
  });
  assert.equal(tokenTotal(summary.today), 20);
  assert.equal(tokenTotal(summary.week), 195);
  assert.equal(summary.session.input, 3);
  assert.equal(summary.dailyLimit, 200);
  assert.ok((summary.budgetRatio ?? 0) > 0);
  const lines = formatUsageOverlayLines(summary);
  assert.ok(lines.some((line) => line.startsWith("today")));
  assert.ok(lines.some((line) => line.startsWith("budget")));
});

test("compactUsageFile folds overflow events into rolled day totals", () => {
  const now = Date.parse("2026-08-20T12:00:00");
  const file = emptyUsageFile();
  for (let i = 0; i < USAGE_COMPACT_EVENT_LIMIT + 5; i++) {
    file.events.push({
      at: now - i * 1000,
      input: 1,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
    });
  }
  const compacted = compactUsageFile(file, now, USAGE_COMPACT_EVENT_LIMIT);
  assert.ok(compacted.events.length <= USAGE_COMPACT_EVENT_LIMIT);
  const rolledTokens = Object.values(compacted.rolled).reduce(
    (n, totals) => n + tokenTotal(totals),
    0,
  );
  assert.equal(rolledTokens + compacted.events.length, USAGE_COMPACT_EVENT_LIMIT + 5);
});

test("recordUsageEvent writes wishcraft-usage.json and survives corrupt JSON", () => {
  const dir = mkdtempSync(join(tmpdir(), "wishcraft-usage-"));
  const path = join(dir, "wishcraft-usage.json");
  try {
    recordUsageEvent(
      {
        at: 1,
        input: 4,
        output: 1,
        cacheRead: 0,
        cacheWrite: 0,
        cost: 0,
      },
      { path, now: 1 },
    );
    const raw = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(raw.events.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function stats(partial: Partial<SessionTokenStats>): SessionTokenStats {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
    subagentCost: 0,
    lastAssistant: undefined,
    thinkingLevelFromSession: null,
    ...partial,
  };
}

function fakeRuntime(initial: SessionTokenStats) {
  let current = initial;
  const rt = {
    sessionUsageBaseline: null,
    tokenStatsCache: { get: () => current },
  } as unknown as RuntimeState;
  return {
    rt,
    setStats(next: SessionTokenStats) {
      current = next;
    },
  };
}

test("billedSessionTotals folds subagent spend into cost like the cost segment", () => {
  const totals = billedSessionTotals(
    stats({ input: 5, cost: 0.4, subagentCost: 0.6 }),
  );
  assert.equal(totals.cost, 1);
});

test("recordSessionUsageDelta adopts a baseline first, then records only the delta", () => {
  const { rt, setStats } = fakeRuntime(stats({ input: 100, output: 10, cost: 0.5 }));
  const recorded: UsageEvent[] = [];
  const record = (event: UsageEvent) => recorded.push(event);
  const ctx = { sessionManager: {}, model: { id: "m" } };

  // First flush of a session only baselines — resumed history is not spend.
  assert.equal(recordSessionUsageDelta(rt, ctx, record), null);
  assert.equal(recorded.length, 0);

  setStats(stats({ input: 140, output: 30, cost: 0.9 }));
  const delta = recordSessionUsageDelta(rt, ctx, record);
  assert.deepEqual(delta, {
    input: 40,
    output: 20,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0.9 - 0.5,
  });
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].input, 40);
  assert.equal(recorded[0].model, "m");

  // An unchanged ledger records nothing.
  assert.equal(recordSessionUsageDelta(rt, ctx, record), null);
  assert.equal(recorded.length, 1);
});

test("recordSessionUsageDelta re-baselines instead of recording negative spend", () => {
  const { rt, setStats } = fakeRuntime(stats({ input: 100, output: 10, cost: 5 }));
  const recorded: UsageEvent[] = [];
  const record = (event: UsageEvent) => recorded.push(event);
  const ctx = { sessionManager: {} };

  recordSessionUsageDelta(rt, ctx, record);
  // Session file switched under us: totals regressed — adopt, don't record.
  setStats(stats({ input: 30, output: 4, cost: 1 }));
  assert.equal(recordSessionUsageDelta(rt, ctx, record), null);
  assert.equal(recorded.length, 0);

  // New baseline is live: subsequent growth records normally.
  setStats(stats({ input: 50, output: 4, cost: 2 }));
  const delta = recordSessionUsageDelta(rt, ctx, record);
  assert.equal(delta?.input, 20);
  assert.equal(recorded.length, 1);
});

test("recordSessionUsageDelta bills whatever the session ledger counts", () => {
  const assistant = (input: number, output: number, cost: number) => ({
    type: "message",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "hi" }],
      usage: {
        input,
        output,
        cacheRead: 0,
        cacheWrite: 0,
        cost: { total: cost },
      },
      stopReason: "stop",
    },
  });
  const a = assistant(10, 5, 0.015);
  const sibling = assistant(20, 7, 0.027);
  const ledger: unknown[] = [a];
  const branch: readonly unknown[] = [a];
  const sessionManager = {
    getLeafId: () => "a",
    getBranch: () => branch,
    getEntries: () => ledger.slice(),
    getEntryCount: () => ledger.length,
  };
  const rt = {
    sessionUsageBaseline: null,
    tokenStatsCache: new SessionUsageCache(),
  } as unknown as RuntimeState;
  const recorded: UsageEvent[] = [];
  const ctx = { sessionManager, model: { name: "test-model" } };

  // Baseline adopts the active branch's spend so far.
  assert.equal(recordSessionUsageDelta(rt, ctx, (e) => recorded.push(e)), null);

  // Spend lands on a forked sibling: the file gains the entry while the
  // active branch stays untouched — exactly what branch-scoped billing missed.
  ledger.push(sibling);
  const delta = recordSessionUsageDelta(rt, ctx, (e) => recorded.push(e));

  assert.deepEqual(
    delta && {
      input: delta.input,
      output: delta.output,
      cacheRead: delta.cacheRead,
      cacheWrite: delta.cacheWrite,
    },
    { input: 20, output: 7, cacheRead: 0, cacheWrite: 0 },
  );
  assert.ok(delta !== null && Math.abs(delta.cost - 0.027) < 1e-12);
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].input, 20);
  assert.equal(recorded[0].model, "test-model");
});
