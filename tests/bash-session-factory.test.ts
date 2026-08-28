import assert from "node:assert/strict";
import test from "node:test";
import {
  createShellSession,
  isPtyPreferred,
  _resetPtyProbeForTests,
  _resetWarnForTests,
} from "../bash-mode/session-factory.ts";
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
  transcript: fakeTranscript(),
  ...overrides,
});

test("factory: returns a PtyManagedShellSession under auto and v2 preferences", () => {
  for (const prefer of ["auto", "v2"] as const) {
    const session = createShellSession(baseOpts({ prefer }));
    assert.ok(
      session instanceof PtyManagedShellSession,
      `prefer=${prefer} must yield the PTY-managed session`,
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

test("factory: missing script(1) still yields a session and warns once (KTD2)", () => {
  _resetPtyProbeForTests();
  const warnings: unknown[] = [];
  const originalWarn = console.warn;
  console.warn = (message?: unknown, ...rest: unknown[]) => {
    warnings.push([message, ...rest]);
  };
  try {
    const session = createShellSession({
      ...baseOpts({ prefer: "v2" }),
      scriptAvailable: () => false,
    });
    assert.ok(session instanceof PtyManagedShellSession, "v2 must still construct");
    const second = createShellSession({
      ...baseOpts({ prefer: "auto" }),
      scriptAvailable: () => false,
    });
    assert.ok(second instanceof PtyManagedShellSession);
    assert.equal(
      warnings.filter((w) => String(w).includes("script(1) unavailable")).length,
      1,
      "degradation warning must fire exactly once across sessions",
    );
  } finally {
    console.warn = originalWarn;
    _resetPtyProbeForTests();
    _resetWarnForTests();
  }
});

test("factory: prefer:\"v2\" yields the PTY-backed managed session (U13 cutover)", () => {
  const session = createShellSession(baseOpts({ prefer: "v2" }));
  assert.ok(session instanceof PtyManagedShellSession);
  assert.equal(session.state.ready, true);
});
