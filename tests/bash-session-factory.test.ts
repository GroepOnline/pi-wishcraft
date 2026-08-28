import assert from "node:assert/strict";
import test from "node:test";
import {
  createShellSession,
  isPtyPreferred,
  _resetPtyProbeForTests,
} from "../bash-mode/session-factory.ts";
import { ManagedShellSession } from "../bash-mode/shell-session.ts";

test("factory: returns a ManagedShellSession under all preferences", () => {
  for (const prefer of ["auto", "v1", "v2"] as const) {
    const session = createShellSession({
      cwd: process.cwd(),
      shellEnv: process.env,
      prefer,
    });
    assert.ok(session instanceof ManagedShellSession, `prefer=${prefer} must yield v1`);
  }
});

test("factory: session carries the requested shell path and cwd", () => {
  const session = createShellSession({
    cwd: "/tmp",
    shellEnv: process.env,
    prefer: "v1",
    shellPath: "/bin/sh",
  });
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

test("factory: a v2 preference without script(1) does not throw", () => {
  _resetPtyProbeForTests();
  const session = createShellSession({
    cwd: process.cwd(),
    shellEnv: process.env,
    prefer: "v2",
  });
  assert.ok(session instanceof ManagedShellSession);
});
