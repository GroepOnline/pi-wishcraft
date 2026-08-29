import assert from "node:assert/strict";
import test from "node:test";
import { BashTranscriptStore } from "../bash-mode/transcript.ts";

function makeStore(): BashTranscriptStore {
  return new BashTranscriptStore({
    transcriptMaxLines: 200,
    transcriptMaxBytes: 64 * 1024,
  });
}

test("recentCommands: returns the last N commands with the last 6 output lines each", () => {
  const store = makeStore();
  for (let i = 0; i < 5; i += 1) {
    store.startCommand(`cmd-${i}`, `echo ${i}`, "/tmp");
    for (let j = 0; j < 10; j += 1) store.appendOutput(`cmd-${i}`, `line-${j}`);
    store.finishCommand(`cmd-${i}`, 0);
  }
  const tail = store.recentCommands(3);
  assert.equal(tail.commands.length, 3);
  assert.equal(tail.commands[0].command, "echo 2");
  assert.equal(tail.commands[2].command, "echo 4");
  for (const command of tail.commands) {
    assert.equal(command.output.length, 6, "output pre-tailed to outputTail (6)");
    assert.equal(command.output[0], "line-4", "keeps the LAST 6 lines");
    assert.equal(command.output[5], "line-9");
  }
});

test("recentCommands: returned command objects are shallow (mutating output must not hit the store)", () => {
  const store = makeStore();
  store.startCommand("cmd-1", "echo hi", "/tmp");
  store.appendOutput("cmd-1", "hi");
  store.finishCommand("cmd-1", 0);
  const tail = store.recentCommands(1);
  tail.commands[0].output.push("injected");
  assert.equal(tail.commands[0].output.length, 2, "tail slice is a fresh array");
  const snapshot = store.getSnapshot();
  assert.equal(snapshot.commands[0].output.length, 1, "store output untouched");
});

test("recentCommands: truncatedCommands passthrough mirrors getSnapshot", () => {
  const store = new BashTranscriptStore({
    transcriptMaxLines: 2,
    transcriptMaxBytes: 64 * 1024,
  });
  for (let i = 0; i < 4; i += 1) {
    store.startCommand(`cmd-${i}`, `c${i}`, "/tmp");
    store.appendOutput(`cmd-${i}`, "x");
    store.finishCommand(`cmd-${i}`, 0);
  }
  assert.equal(store.getSnapshot().truncatedCommands, 2);
  assert.equal(store.recentCommands(2).truncatedCommands, 2);
});

test("recentCommands: default count keeps all when fewer commands exist", () => {
  const store = makeStore();
  store.startCommand("cmd-1", "a", "/tmp");
  store.finishCommand("cmd-1", 0);
  assert.equal(store.recentCommands(4).commands.length, 1);
});