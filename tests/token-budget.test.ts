import test from "node:test";
import assert from "node:assert/strict";

import {
  costColorForBudget,
  formatTokenBudgetWarning,
  parseTokenBudget,
  tokenBudgetLevel,
  tokenBudgetSnapshotForDay,
} from "../src/usage/token-budget.ts";

test("parseTokenBudget reads wishcraft.tokenBudget.daily", () => {
  assert.equal(parseTokenBudget(undefined).daily, null);
  assert.equal(parseTokenBudget({ tokenBudget: { daily: 50_000 } }).daily, 50_000);
  assert.equal(parseTokenBudget({ tokenBudget: { daily: 0 } }).daily, null);
  assert.equal(parseTokenBudget({ daily: 10 }).daily, 10);
});

test("tokenBudgetLevel trips at 80% and 100% and never blocks", () => {
  assert.deepEqual(tokenBudgetLevel(79, 100), { ratio: 0.79, level: 0 });
  assert.equal(tokenBudgetLevel(80, 100).level, 80);
  assert.equal(tokenBudgetLevel(100, 100).level, 100);
  assert.equal(costColorForBudget(80), "contextWarn");
  assert.equal(costColorForBudget(100), "contextError");
  assert.equal(costColorForBudget(0), "cost");
  assert.match(formatTokenBudgetWarning(80, 100, 80), /80%/);
});

test("token budget snapshot resets usage when the local day rolls over", () => {
  const yesterday = {
    day: "2026-08-24",
    dailyLimit: 100_000,
    dailyUsed: 82_000,
  };

  assert.equal(tokenBudgetSnapshotForDay(yesterday, "2026-08-24"), yesterday);
  assert.deepEqual(tokenBudgetSnapshotForDay(yesterday, "2026-08-25"), {
    day: "2026-08-25",
    dailyLimit: 100_000,
    dailyUsed: 0,
  });
});