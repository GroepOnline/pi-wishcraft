import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getPromptHistoryState,
  getPromptHistoryText,
  hasNonWhitespaceText,
  isPromptHistoryState,
  readPromptHistory,
  readRecentProjectPrompts,
  restorePromptHistory,
  snapshotPromptHistory,
  trackPromptHistory,
} from "../src/extension/history/prompt-history.ts";
import {
  buildStashPreview,
  normalizeStashHistoryEntries,
  pushStashHistory,
} from "../src/extension/history/stash-history.ts";

function editorWith(history: unknown[]): { history: unknown[]; addToHistory: (text: string) => void; added: string[] } {
  const added: string[] = [];
  return {
    history,
    // A real editor records the entry into its own history stack before
    // returning, so the tracker's re-snapshot can observe it.
    addToHistory(text: string) {
      (this.history as unknown[]).push(text);
      added.push(text);
    },
    added,
  };
}

test("history: hasNonWhitespaceText is the single emptiness gate", () => {
  assert.equal(hasNonWhitespaceText("hello"), true);
  assert.equal(hasNonWhitespaceText("  \t\n "), false);
  assert.equal(hasNonWhitespaceText(""), false);
});

test("history: readPromptHistory trims, dedupes and caps the editor history", () => {
  const editor = editorWith([
    "  first  ",
    "first",
    "",
    "   ",
    "second",
    42,
    "third",
  ]);
  assert.deepEqual(readPromptHistory(editor), ["first", "second", "third"]);
  assert.deepEqual(readPromptHistory(null), []);
  assert.deepEqual(readPromptHistory(editorWith("nope" as unknown as unknown[])), []);
});

test("history: snapshot/restore round-trips through the global state", () => {
  const editor = editorWith(["alpha", "beta"]);
  snapshotPromptHistory(editor);
  const state = getPromptHistoryState();
  assert.deepEqual(state.savedPromptHistory, ["alpha", "beta"]);

  // Restore replays newest-first so the editor stack ends in original order.
  const target = editorWith([]);
  restorePromptHistory(target);
  assert.deepEqual(target.added, ["beta", "alpha"]);

  // Restoring into an editor without addToHistory is a no-op.
  assert.doesNotThrow(() => restorePromptHistory({}));
});

test("history: trackPromptHistory wraps addToHistory once and keeps it fresh", () => {
  const editor = editorWith(["one"]);
  trackPromptHistory(editor);
  editor.addToHistory("two");
  assert.deepEqual(getPromptHistoryState().savedPromptHistory, ["one", "two"]);

  // Re-tracking must not double-wrap: addToHistory stays single-tracked.
  const before = editor.addToHistory;
  trackPromptHistory(editor);
  editor.addToHistory("three");
  assert.equal(editor.addToHistory, before);
  assert.deepEqual(getPromptHistoryState().savedPromptHistory, ["one", "two", "three"]);
});

test("history: isPromptHistoryState validates the persisted shape", () => {
  assert.equal(isPromptHistoryState({ savedPromptHistory: ["a", "b"] }), true);
  assert.equal(isPromptHistoryState({ savedPromptHistory: ["a", 3] }), false);
  assert.equal(isPromptHistoryState({ savedPromptHistory: "nope" }), false);
  assert.equal(isPromptHistoryState(null), false);
});

test("history: getPromptHistoryText flattens text blocks and strings", () => {
  assert.equal(getPromptHistoryText("plain"), "plain");
  assert.equal(
    getPromptHistoryText([
      { type: "text", text: "hello " },
      { type: "text", text: "world" },
      { type: "tool_use" },
    ]),
    "hello world",
  );
  assert.equal(getPromptHistoryText([{ type: "text", text: "   " }]), "");
  assert.equal(getPromptHistoryText(42), "");
});

test("history: readRecentProjectPrompts parses session JSONL newest-first", () => {
  const root = mkdtempSync(join(tmpdir(), "wishcraft-hist-"));
  // The module resolves sessions under the agent dir; PI_CODING_AGENT_DIR is
  // the documented injection hook, so point it at our temp tree.
  const prevAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = root;
  try {
    const sessionsDir = join(root, "sessions", `--${tmpProjectKey(root)}--`);
    mkdirSync(sessionsDir, { recursive: true });
    const file = join(sessionsDir, "s1.jsonl");
    const line1 = JSON.stringify({
      type: "message",
      timestamp: "2026-09-01T10:00:00Z",
      message: { role: "user", content: [{ type: "text", text: "oldest prompt" }] },
    });
    const line2 = JSON.stringify({
      type: "message",
      timestamp: "2026-09-02T10:00:00Z",
      message: { role: "user", content: "newer prompt" },
    });
    writeFileSync(file, [line1, '{"type":"message","message":{"role":"assistant"}}', line2, "not json", ""].join("\n"));
    const prompts = readRecentProjectPrompts(root, 10);
    assert.deepEqual(prompts, ["newer prompt", "oldest prompt"]);
  } finally {
    if (prevAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = prevAgentDir;
    rmSync(root, { recursive: true, force: true });
  }
});

function tmpProjectKey(cwd: string): string {
  return cwd.replace(/^[/\\]+|[/\\]+$/g, "").replace(/[\\/]+/g, "-");
}

test("history: readRecentProjectPrompts returns empty for unknown projects", () => {
  assert.deepEqual(readRecentProjectPrompts("/definitely/not/a/real/path-xyz", 10), []);
});

test("stash-history: normalize keeps valid, non-adjacent-duplicate entries and caps", () => {
  assert.deepEqual(normalizeStashHistoryEntries(["a", "a", "  ", 3, "b"]), ["a", "b"]);
  const many = Array.from({ length: 30 }, (_, i) => `entry-${i}`);
  assert.equal(normalizeStashHistoryEntries(many).length, 12, "STASH_HISTORY_LIMIT");
});

test("stash-history: pushStashHistory pushes, dedupes the head and caps", () => {
  const history: string[] = ["old"];
  assert.equal(pushStashHistory(history, "new"), true);
  assert.deepEqual(history, ["new", "old"]);
  assert.equal(pushStashHistory(history, "new"), false, "head duplicate is a no-op");
  assert.equal(pushStashHistory(history, "   "), false, "whitespace never pushes");
  for (let i = 0; i < 20; i++) pushStashHistory(history, `x${i}`);
  assert.equal(history.length, 12);
});

test("stash-history: buildStashPreview compacts and fits the width", () => {
  const preview = buildStashPreview("hello   \n world  ", 20);
  assert.ok(preview.length <= 20, `preview must fit: ${JSON.stringify(preview)}`);
  assert.match(preview.replace(/\x1b\[[0-9;]*m/g, ""), /^hello/);
});
