import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
