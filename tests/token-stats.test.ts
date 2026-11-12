import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  computeSessionTokenStats,
  SessionBranchCache,
  SessionTokenStatsCache,
  SessionUsageCache,
} from "../src/usage/ledger.ts";

function makeUsage(
  input: number,
  output: number,
  cacheRead = 0,
  cacheWrite = 0,
  costPerToken = 0.001,
) {
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    cost: { total: (input + output + cacheRead + cacheWrite) * costPerToken },
  };
}

function assistantEvent(
  usage: ReturnType<typeof makeUsage>,
  stopReason: string = "stop",
) {
  return {
    type: "message",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "hi" }],
      usage,
      stopReason,
    },
  };
}

function userEvent() {
  return {
    type: "message",
    message: { role: "user", content: [{ type: "text", text: "hello" }] },
  };
}

function subagentToolResultEvent(costs: number[]) {
  return {
    type: "message",
    message: {
      role: "toolResult",
      toolName: "subagent",
      details: { results: costs.map((cost) => ({ usage: { cost } })) },
    },
  };
}

function subagentSlashResultEvent(costs: number[]) {
  return {
    type: "custom_message",
    customType: "subagent-slash-result",
    details: {
      result: {
        details: { results: costs.map((cost) => ({ usage: { cost } })) },
      },
    },
  };
}

test("session branch cache reuses a leaf path and refreshes when the leaf changes", () => {
  const cache = new SessionBranchCache();
  let leafId = "leaf-1";
  let branch: unknown[] = [{ id: leafId, value: 1 }];
  let branchReads = 0;
  const provider = {
    getLeafId: () => leafId,
    getBranch: () => {
      branchReads += 1;
      return branch;
    },
  };

  assert.deepEqual(cache.get(null), []);

  const first = cache.get(provider);
  (branch[0] as { value: number }).value = 2;
  assert.equal(cache.get(provider), first);
  assert.equal((cache.get(provider)[0] as { value: number }).value, 2);
  assert.equal(branchReads, 1);

  leafId = "leaf-2";
  branch = [...branch, { id: leafId }];
  assert.equal(cache.get(provider), branch);
  assert.equal(branchReads, 2);

  cache.reset();
  cache.get(provider);
  assert.equal(branchReads, 3);
});

test("computeSessionTokenStats aggregates usage and tracks thinking level", () => {
  const events = [
    userEvent(),
    { type: "thinking_level_change", thinkingLevel: "high" },
    assistantEvent(makeUsage(10, 5)),
    assistantEvent(makeUsage(20, 7, 3, 2), "error"), // skipped: error
    assistantEvent(makeUsage(30, 9, 4, 1), "aborted"), // skipped: aborted
    assistantEvent(makeUsage(40, 11, 6, 2)),
  ];

  const stats = computeSessionTokenStats(events);

  assert.equal(stats.input, 50);
  assert.equal(stats.output, 16);
  assert.equal(stats.cacheRead, 6);
  assert.equal(stats.cacheWrite, 2);
  assert.ok(Math.abs(stats.cost - 0.074) < 1e-12);
  assert.equal(stats.lastAssistant, (events[5] as any).message);
  assert.equal(stats.thinkingLevelFromSession, "high");
});

test("computeSessionTokenStats sums subagent child run cost from tool results and slash results", () => {
  const events = [
    userEvent(),
    assistantEvent(makeUsage(10, 5)),
    subagentToolResultEvent([0.12, 0.34]),
    subagentSlashResultEvent([0.5]),
  ];

  const stats = computeSessionTokenStats(events);
  assert.ok(Math.abs(stats.subagentCost - 0.96) < 1e-12);
});

test("computeSessionTokenStats ignores assistant messages without tokens for lastAssistant", () => {
  const events = [
    assistantEvent(makeUsage(10, 5)),
    assistantEvent(makeUsage(0, 0)),
  ];

  const stats = computeSessionTokenStats(events);
  assert.equal(stats.lastAssistant, (events[0] as any).message);
});

test("cache reuses stats object while session is unchanged", () => {
  const cache = new SessionTokenStatsCache();
  const events = [userEvent(), assistantEvent(makeUsage(10, 5))];

  const first = cache.get(events);
  const second = cache.get(events);

  assert.equal(second, first);
});

test("cache recomputes when events are appended", () => {
  const cache = new SessionTokenStatsCache();
  const events = [assistantEvent(makeUsage(10, 5))];

  const first = cache.get(events);
  events.push(assistantEvent(makeUsage(20, 7)));
  const second = cache.get(events);

  assert.notEqual(second, first);
  assert.equal(second.input, 30);
  assert.equal(second.output, 12);
});

test("cache recomputes when the last event is updated in place (streaming)", () => {
  const cache = new SessionTokenStatsCache();
  const tail = assistantEvent(makeUsage(10, 5), "streaming");
  const events = [userEvent(), tail];

  const first = cache.get(events);
  assert.equal(first.output, 5);

  // Streaming updates the trailing assistant message in place: same event
  // count, same object references, fresh usage numbers.
  tail.message.usage = makeUsage(10, 42);
  tail.message.stopReason = "stop";

  const second = cache.get(events);
  assert.notEqual(second, first);
  assert.equal(second.output, 42);
  assert.equal(second.lastAssistant, tail.message);
});

test("cache recomputes when the last subagent result cost is updated in place", () => {
  const cache = new SessionTokenStatsCache();
  const tail = subagentToolResultEvent([0.1]);
  const events = [assistantEvent(makeUsage(10, 5)), tail];

  const first = cache.get(events);
  assert.equal(first.subagentCost, 0.1);

  tail.message.details.results = [{ usage: { cost: 0.3 } }];

  const second = cache.get(events);
  assert.notEqual(second, first);
  assert.equal(second.subagentCost, 0.3);
});

test("cache recomputes when the last event turns into an error in place", () => {
  const cache = new SessionTokenStatsCache();
  const tail = assistantEvent(makeUsage(10, 5));
  const events = [assistantEvent(makeUsage(1, 1)), tail];

  const first = cache.get(events);
  assert.equal(first.input, 11);

  tail.message.stopReason = "error";

  const second = cache.get(events);
  assert.notEqual(second, first);
  assert.equal(second.input, 1);
});

test("cache recomputes when the last event is replaced with a same-sized list", () => {
  const cache = new SessionTokenStatsCache();
  const events = [userEvent(), assistantEvent(makeUsage(10, 5))];

  const first = cache.get(events);
  events[1] = assistantEvent(makeUsage(10, 5));
  const second = cache.get(events);

  assert.notEqual(second, first);
  assert.deepEqual(
    { input: second.input, output: second.output },
    { input: first.input, output: first.output },
  );
});

test("cache does not rescan for in-place changes to non-trailing events", () => {
  const cache = new SessionTokenStatsCache();
  const head = assistantEvent(makeUsage(10, 5));
  const events = [head, assistantEvent(makeUsage(20, 7))];

  const first = cache.get(events);

  // Historical events are treated as immutable; only the trailing event is
  // re-validated. This documents the cache's correctness boundary.
  head.message.usage = makeUsage(999, 999);
  const second = cache.get(events);

  assert.equal(second, first);
  assert.equal(second.input, 30);
});

test("reset forces recomputation", () => {
  const cache = new SessionTokenStatsCache();
  const events = [assistantEvent(makeUsage(10, 5))];

  const first = cache.get(events);
  cache.reset();
  const second = cache.get(events);

  assert.notEqual(second, first);
  assert.equal(second.input, first.input);
});

function ledgerProvider(options: {
  leafId: () => string | null;
  branch: () => readonly unknown[];
  entries: () => readonly unknown[];
  entryCount?: () => number;
}) {
  return {
    getLeafId: options.leafId,
    getBranch: options.branch,
    getEntries: options.entries,
    ...(options.entryCount ? { getEntryCount: options.entryCount } : {}),
  };
}

test("SessionUsageCache bills the whole session file, not only the active branch", () => {
  const cache = new SessionUsageCache();
  const a = assistantEvent(makeUsage(10, 5));
  const siblingSpend = assistantEvent(makeUsage(20, 7));
  const b = assistantEvent(makeUsage(30, 9));
  // The ledger holds both branches of the fork; the active branch is only b.
  const ledger = [a, siblingSpend, b];
  let leafId = "b";
  const provider = ledgerProvider({
    leafId: () => leafId,
    branch: () => [b],
    entries: () => ledger.slice(),
    entryCount: () => ledger.length,
  });

  const stats = cache.get(provider);
  assert.equal(stats.input, 60);
  assert.equal(stats.output, 21);
  assert.deepEqual(stats, {
    ...computeSessionTokenStats(ledger),
    lastAssistant: b.message,
    thinkingLevelFromSession: null,
  });
});

test("SessionUsageCache keeps context fields on the active branch", () => {
  const cache = new SessionUsageCache();
  const high = { type: "thinking_level_change", thinkingLevel: "high" };
  const low = { type: "thinking_level_change", thinkingLevel: "low" };
  const a = assistantEvent(makeUsage(10, 5));
  const b = assistantEvent(makeUsage(20, 7));
  const ledger = [high, a, low, b];
  let leafId = "a";
  let branch: readonly unknown[] = [high, a];
  const provider = ledgerProvider({
    leafId: () => leafId,
    branch: () => branch,
    entries: () => ledger.slice(),
    entryCount: () => ledger.length,
  });

  const first = cache.get(provider);
  assert.equal(first.input, 30);
  assert.equal(first.lastAssistant, a.message);
  assert.equal(first.thinkingLevelFromSession, "high");

  // Navigating the tree to the sibling leaf keeps the billed totals but
  // swaps which branch owns the context fields.
  leafId = "b";
  branch = [low, b];
  const second = cache.get(provider);
  assert.equal(second.input, first.input);
  assert.equal(second.lastAssistant, b.message);
  assert.equal(second.thinkingLevelFromSession, "low");
});

test("SessionUsageCache does not re-copy the ledger while the session is unchanged", () => {
  const cache = new SessionUsageCache();
  const entries = [userEvent(), assistantEvent(makeUsage(10, 5))];
  let ledgerReads = 0;
  const provider = ledgerProvider({
    leafId: () => "leaf",
    branch: () => entries,
    entries: () => {
      ledgerReads += 1;
      return entries.slice();
    },
    entryCount: () => entries.length,
  });

  assert.equal(cache.get(provider).input, 10);
  assert.equal(ledgerReads, 1);
  for (let i = 0; i < 20; i++) cache.get(provider);
  assert.equal(ledgerReads, 1);
});

test("SessionUsageCache notices appends on an unchanged leaf via the entry count", () => {
  const cache = new SessionUsageCache();
  const entries: unknown[] = [userEvent()];
  const provider = ledgerProvider({
    leafId: () => "root",
    branch: () => entries,
    entries: () => entries.slice(),
    entryCount: () => entries.length,
  });

  assert.equal(cache.get(provider).input, 0);
  entries.push(assistantEvent(makeUsage(2000, 0)));
  // Same leaf, same provider — only the entry count moved.
  assert.equal(cache.get(provider).input, 2000);
});

test("SessionUsageCache notices an in-place streaming tail on a snapshotted ledger", () => {
  const cache = new SessionUsageCache();
  const tail = assistantEvent(makeUsage(10, 5), "streaming");
  const entries: unknown[] = [tail];
  const provider = ledgerProvider({
    leafId: () => "root",
    branch: () => entries,
    entries: () => entries.slice(),
    entryCount: () => entries.length,
  });

  assert.equal(cache.get(provider).output, 5);
  // getEntries() copies the array but shares entry objects, so an in-place
  // usage bump on the trailing message still reaches the ledger stats.
  tail.message.usage = makeUsage(10, 42);
  assert.equal(cache.get(provider).output, 42);
});

test("SessionUsageCache without an entry count still refreshes on leaf changes and reset", () => {
  const cache = new SessionUsageCache();
  const entries: unknown[] = [userEvent()];
  let leafId = "one";
  const provider = ledgerProvider({
    leafId: () => leafId,
    branch: () => entries,
    entries: () => entries.slice(),
  });

  assert.equal(cache.get(provider).input, 0);
  entries.push(assistantEvent(makeUsage(7, 3)));
  // No getEntryCount: the stale snapshot survives an unchanged leaf.
  assert.equal(cache.get(provider).input, 0);
  leafId = "two";
  assert.equal(cache.get(provider).input, 7);
  leafId = "one";
  cache.reset();
  assert.equal(cache.get(provider).input, 7);
});

test("SessionUsageCache falls back to branch stats when the ledger is not readable", () => {
  const cache = new SessionUsageCache();
  const a = assistantEvent(makeUsage(10, 5));
  const provider = {
    getLeafId: () => "a",
    getBranch: () => [a],
  };

  const stats = cache.get(provider);
  assert.equal(stats.input, 10);
  assert.equal(stats.lastAssistant, a.message);
});

test("SessionUsageCache reset covers both scopes", () => {
  const cache = new SessionUsageCache();
  const a = assistantEvent(makeUsage(10, 5));
  const b = assistantEvent(makeUsage(20, 7));
  const ledger = [a, b];
  const provider = ledgerProvider({
    leafId: () => "b",
    branch: () => [b],
    entries: () => ledger.slice(),
    entryCount: () => ledger.length,
  });

  const first = cache.get(provider);
  assert.equal(first.input, 30);
  cache.reset();
  const second = cache.get(provider);
  assert.notEqual(second, first);
  assert.equal(second.input, 30);
  assert.equal(second.lastAssistant, b.message);
});

test("segment-context wires the session usage cache into buildSegmentContext", () => {
  const stateSource = readFileSync(
    new URL("../src/extension/core/state.ts", import.meta.url),
    "utf-8",
  );
  const contextSource = readFileSync(
    new URL("../src/extension/core/segment-context.ts", import.meta.url),
    "utf-8",
  );
  assert.match(
    stateSource,
    /import \{\s*SessionUsageCache\s*\} from "(?:\.\.\/)+usage\/ledger\.ts";/,
  );
  assert.match(contextSource, /tokenStatsCache\.get\(\s*ctx\.sessionManager,?\s*\)/);
  assert.match(contextSource, /tokenStatsCache\.reset\(\)/);
});
