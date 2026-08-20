import test from "node:test";
import assert from "node:assert/strict";

import {
  acceptGhostSuggestion,
  completeGhostSuggestionOneToken,
} from "../bash-mode/editor-ghost.ts";
import {
  isPromptHistoryRecallPosition,
  navigateShellHistory,
} from "../bash-mode/editor-history.ts";
import { moveCursorToEditorBoundary } from "../bash-mode/editor-input.ts";

function makeShellHistoryEditor() {
  return {
    shellHistoryIndex: -1,
    shellHistoryItems: [] as string[],
    shellHistoryDraft: "",
    getExpandedText: () => "draft",
    setText: (_text: string) => {},
    clearGhostSuggestion: () => {},
    scheduleGhostUpdate: () => {},
    optionsRef: {
      getHistoryEntries: (_prefix: string) => ["first", "second"],
      onNotify: (_message: string, _level?: string) => {},
    },
  };
}

function makeGhostEditor(overrides: Record<string, unknown> = {}) {
  return {
    ghost: { value: "git status", source: "git" },
    getExpandedText: () => "git",
    getCursor: () => ({ line: 0, col: 3 }),
    setText: (_text: string) => {},
    clearGhostSuggestion: () => {},
    scheduleGhostUpdate: () => {},
    ...overrides,
  };
}

test("moveCursorToEditorBoundary moves to the first and last visual positions", () => {
  const state = { lines: ["ab", "cde"], cursorLine: 1, cursorCol: 1 };
  let rendered = 0;
  const editor = {
    state,
    tui: { requestRender: () => void (rendered += 1) },
  };

  moveCursorToEditorBoundary(editor, "start");
  assert.equal(state.cursorLine, 0);
  assert.equal(state.cursorCol, 0);
  assert.equal(rendered, 1);

  moveCursorToEditorBoundary(editor, "end");
  assert.equal(state.cursorLine, 1);
  assert.equal(state.cursorCol, 3);
  assert.equal(rendered, 2);
});

test("moveCursorToEditorBoundary throws when the cursor state is unavailable", () => {
  assert.throws(
    () => moveCursorToEditorBoundary({}, "start"),
    /Editor cursor state is unavailable/,
  );
});

test("isPromptHistoryRecallPosition requires autocomplete off and history present", () => {
  const editor = {
    isShowingAutocomplete: () => false,
    history: ["a", "b"],
    getLines: () => ["hello"],
    getCursor: () => ({ line: 0, col: 5 }),
  };
  assert.equal(isPromptHistoryRecallPosition(editor), true);

  assert.equal(
    isPromptHistoryRecallPosition({
      ...editor,
      isShowingAutocomplete: () => true,
    }),
    false,
  );
  assert.equal(
    isPromptHistoryRecallPosition({ ...editor, history: [] }),
    false,
  );
});

test("isPromptHistoryRecallPosition respects the first visual line on multi-line input", () => {
  const base = {
    isShowingAutocomplete: () => false,
    history: ["a"],
    getLines: () => ["line1", "line2"],
    getCursor: () => ({ line: 0, col: 2 }),
  };
  assert.equal(
    isPromptHistoryRecallPosition({
      ...base,
      isOnFirstVisualLine: () => true,
    }),
    true,
  );
  assert.equal(
    isPromptHistoryRecallPosition({
      ...base,
      isOnFirstVisualLine: () => false,
    }),
    false,
  );
});

test("navigateShellHistory steps through entries and restores the draft", () => {
  const editor = makeShellHistoryEditor();
  const calls: string[] = [];
  editor.setText = (text) => void calls.push(`set:${text}`);
  editor.clearGhostSuggestion = () => void calls.push("clear");
  editor.scheduleGhostUpdate = () => void calls.push("schedule");

  navigateShellHistory(editor, -1);
  assert.equal(editor.shellHistoryIndex, 0);
  assert.deepEqual(calls, ["set:first", "clear"]);

  calls.length = 0;
  navigateShellHistory(editor, -1);
  assert.equal(editor.shellHistoryIndex, 1);
  assert.deepEqual(calls, ["set:second", "clear"]);

  calls.length = 0;
  navigateShellHistory(editor, 1);
  assert.equal(editor.shellHistoryIndex, 0);
  assert.deepEqual(calls, ["set:first", "clear"]);

  calls.length = 0;
  navigateShellHistory(editor, 1);
  assert.equal(editor.shellHistoryIndex, -1);
  assert.deepEqual(calls, ["set:draft", "schedule"]);
});

test("navigateShellHistory notifies and keeps the draft when nothing matches", () => {
  const editor = makeShellHistoryEditor();
  const notifications: string[] = [];
  editor.optionsRef.getHistoryEntries = () => [];
  editor.optionsRef.onNotify = (message) => void notifications.push(message);

  navigateShellHistory(editor, -1);
  assert.deepEqual(notifications, ["No shell history matches"]);
  assert.equal(editor.shellHistoryIndex, -1);
  assert.equal(editor.shellHistoryDraft, "draft");
  assert.deepEqual(editor.shellHistoryItems, []);
});

test("acceptGhostSuggestion inserts the full suggestion at end-of-line", () => {
  let text = "git";
  const editor = makeGhostEditor({
    setText: (next: string) => void (text = next),
  });
  assert.equal(acceptGhostSuggestion(editor), true);
  assert.equal(text, "git status");
});

test("acceptGhostSuggestion rejects cursor-not-at-end or non-prefix ghosts", () => {
  assert.equal(
    acceptGhostSuggestion(makeGhostEditor({ getCursor: () => ({ line: 0, col: 1 }) })),
    false,
  );
  assert.equal(
    acceptGhostSuggestion(
      makeGhostEditor({
        ghost: { value: "ls -la", source: "executable" },
        getExpandedText: () => "git",
        getCursor: () => ({ line: 0, col: 3 }),
      }),
    ),
    false,
  );
  assert.equal(acceptGhostSuggestion(makeGhostEditor({ ghost: null })), false);
});

test("completeGhostSuggestionOneToken inserts one whitespace-delimited chunk", () => {
  let text = "git";
  let scheduled = 0;
  const editor = makeGhostEditor({
    ghost: { value: "git checkout -b main", source: "git" },
    setText: (next: string) => void (text = next),
    scheduleGhostUpdate: () => void (scheduled += 1),
  });
  assert.equal(completeGhostSuggestionOneToken(editor), true);
  assert.equal(text, "git checkout");
  assert.equal(scheduled, 1);
});

test("completeGhostSuggestionOneToken clears when the final chunk completes", () => {
  let text = "git statu";
  let cleared = 0;
  let scheduled = 0;
  const editor = makeGhostEditor({
    ghost: { value: "git status", source: "git" },
    getExpandedText: () => "git statu",
    getCursor: () => ({ line: 0, col: "git statu".length }),
    setText: (next: string) => void (text = next),
    clearGhostSuggestion: () => void (cleared += 1),
    scheduleGhostUpdate: () => void (scheduled += 1),
  });
  assert.equal(completeGhostSuggestionOneToken(editor), true);
  assert.equal(text, "git status");
  assert.equal(cleared, 1);
  assert.equal(scheduled, 0);
});
