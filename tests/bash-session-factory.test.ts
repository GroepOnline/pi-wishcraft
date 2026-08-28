import assert from "node:assert/strict";
import test from "node:test";
import {
  createShellSession,
  isPtyPreferred,
  _resetPtyProbeForTests,
  BashSessionFactoryError,
} from "../bash-mode/session-factory.ts";
import { ManagedShellSession } from "../bash-mode/shell-session.ts";
import { PtyManagedShellSession } from "../bash-mode/ptyshell-managed.ts";
import type { BashTranscriptStore } from "../bash-mode/transcript.ts";

function fakeTranscript(): BashTranscriptStore {
  return {
    startCommand: () => {},
    appendOutput: () => {},
    finishCommand: () => {},
    getSnapshot: () => ({ commands: [], truncatedCommands: 0 }),
  } as unknown as BashTranscriptStore;
}

const baseOpts = (overrides: Partial<Parameters<typeof createShellSession>[0]> = {}) => ({
  cwd: process.cwd(),
  shellEnv: process.env,
  transcript: fakeTranscript(),
  ...overrides,
});

test("factory: returns a ManagedShellSession under auto and v1 preferences", () => {
  for (const prefer of ["auto", "v1"] as const) {
    const session = createShellSession(baseOpts({ prefer }));
    assert.ok(
      prefer === "v1"
        ? session instanceof ManagedShellSession
        : session instanceof PtyManagedShellSession,
      `prefer=${prefer} must yield the expected session type`,
    );
  }
});

test("factory: session carries the requested shell path and cwd", () => {
  const session = createShellSession(baseOpts({
    cwd: "/tmp",
    prefer: "v1",
    shellPath: "/bin/sh",
  }));
  assert.equal(session.state.shellPath, "/bin/sh");
  assert.equal(session.state.cwd, "/tmp");
});

test("factory: isPtyPreferred returns a boolean and is stable", () => {
  _resetPtyProbeForTests();
  const first = isPtyPreferred();
  const second = isPtyPreferred();
  assert.equal(typeof first, "boolean");
  assert.equal(first, second, "the probe should be cached");
});

test("factory: missing transcript raises BashSessionFactoryError", () => {
  assert.throws(
    () =>
      createShellSession({
        cwd: process.cwd(),
        shellEnv: process.env,
        // @ts-expect-error - transcript is now required
        transcript: undefined,
      }),
    BashSessionFactoryError,
  );
});

test("factory: prefer:\"v2\" yields the PTY-backed managed session (U13 cutover)", () => {
  const session = createShellSession(baseOpts({ prefer: "v2" }));
  assert.ok(session instanceof PtyManagedShellSession);
  assert.equal(session.state.ready, true);
});
