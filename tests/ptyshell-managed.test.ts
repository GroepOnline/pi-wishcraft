import assert from "node:assert/strict";
import test from "node:test";
import { PtyManagedShellSession } from "../bash-mode/ptyshell-managed.ts";
import { BashTranscriptStore } from "../bash-mode/transcript.ts";

function makeTranscript(): BashTranscriptStore {
  return new BashTranscriptStore({
    transcriptMaxLines: 200,
    transcriptMaxBytes: 64 * 1024,
  });
}

function makeSession(
  overrides: {
    shellPath?: string;
    cwd?: string;
    initScript?: string | null;
  } = {},
): PtyManagedShellSession {
  const transcript = makeTranscript();
  const session = new PtyManagedShellSession(
    overrides.shellPath ?? "/bin/sh",
    overrides.cwd ?? process.cwd(),
    transcript,
    () => {},
    () => {},
    overrides.initScript ?? null,
  );
  return session;
}

test("managed v2: runs a command and records exit code + output in the transcript", async () => {
  const transcript = makeTranscript();
  const session = new PtyManagedShellSession(
    "/bin/sh",
    process.cwd(),
    transcript,
    () => {},
    () => {},
    null,
  );
  await session.runCommand("printf 'hello\\nworld\\n'");
  assert.equal(session.state.lastExitCode, 0);
  const snapshot = transcript.getSnapshot();
  assert.equal(snapshot.commands.length, 1);
  assert.equal(snapshot.commands[0].command, "printf 'hello\\nworld\\n'");
  assert.equal(snapshot.commands[0].exitCode, 0);
  assert.ok(snapshot.commands[0].output.length >= 2, "expected output lines");
  session.dispose();
});

test("managed v2: carries cwd between commands via the sentinel", async () => {
  const session = makeSession({ cwd: "/tmp" });
  await session.runCommand("pwd");
  assert.equal(session.state.cwd, "/tmp");
  await session.runCommand("mkdir -p wishcraft-pty-cwd-test && cd wishcraft-pty-cwd-test");
  assert.ok(
    session.state.cwd.endsWith("wishcraft-pty-cwd-test"),
    `cwd should follow the cd, got ${session.state.cwd}`,
  );
  await session.runCommand("cd /tmp && rmdir wishcraft-pty-cwd-test");
  assert.ok(session.state.cwd.endsWith("/tmp"), `back to /tmp, got ${session.state.cwd}`);
  session.dispose();
});

test("managed v2: a failing command reports a non-zero exit code", async () => {
  const session = makeSession();
  await session.runCommand("exit 7");
  assert.equal(session.state.lastExitCode, 7);
  session.dispose();
});

test("managed v2: interrupt maps a sleeping command to exit 130", async () => {
  const session = makeSession();
  const run = session.runCommand("sleep 30");
  await new Promise((resolve) => setTimeout(resolve, 300));
  session.interrupt();
  await run;
  assert.equal(session.state.lastExitCode, 130);
  session.dispose();
}, { timeout: 10_000 });

test("managed v2: running guard rejects a second command", async () => {
  const session = makeSession();
  const run = session.runCommand("sleep 30");
  await new Promise((resolve) => setTimeout(resolve, 300));
  await assert.rejects(() => session.runCommand("echo nope"), /already running/);
  session.interrupt();
  await run;
  session.dispose();
}, { timeout: 10_000 });

test("managed v2: initScript runs as a preamble of each command", async () => {
  const transcript = makeTranscript();
  const session = new PtyManagedShellSession(
    "/bin/sh",
    process.cwd(),
    transcript,
    () => {},
    () => {},
    "export PI_TEST_MARKER=wishcraft",
  );
  await session.runCommand('printf "%s" "$PI_TEST_MARKER"');
  const record = transcript.getSnapshot().commands.at(-1);
  assert.ok(
    record?.output.some((line) => line.includes("wishcraft")),
    "initScript env var must be visible to the command",
  );
  session.dispose();
});

test("managed v2: dispose during a run kills the child", async () => {
  const session = makeSession();
  const run = session.runCommand("sleep 30");
  await new Promise((resolve) => setTimeout(resolve, 300));
  session.dispose();
  await run;
  assert.equal(session.state.running, false);
}, { timeout: 10_000 });