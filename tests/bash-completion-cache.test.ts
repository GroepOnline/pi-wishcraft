import assert from "node:assert/strict";
import test from "node:test";
import { getOneOffBashCommandContext } from "../bash-mode/completion.ts";
import { matchHistoryEntries } from "../bash-mode/history.ts";

test("one-off bash context distinguishes ! and !! prefixes", () => {
  assert.deepEqual(getOneOffBashCommandContext("!!git status"), {
    prefix: "!!",
    command: "git status",
    offset: 2,
  });
  assert.deepEqual(getOneOffBashCommandContext("!ls"), {
    prefix: "!",
    command: "ls",
    offset: 1,
  });
  assert.equal(getOneOffBashCommandContext("echo !ls"), null);
});

test("history matching deduplicates and respects the requested limit", () => {
  assert.deepEqual(
    matchHistoryEntries(["git status", "git status", "git diff", "npm test"], "git", 2),
    ["git status", "git diff"],
  );
});
