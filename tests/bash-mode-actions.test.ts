import assert from "node:assert/strict";
import test from "node:test";
import {
  getShellCwd,
  getShellHistoryEntries,
  getShellPath,
} from "../src/extension/commands/bash-mode-actions.ts";

test("bash-mode-actions: getShellPath honours SHELL with a /bin/sh fallback", () => {
  const prev = process.env.SHELL;
  try {
    process.env.SHELL = "/bin/bash";
    assert.equal(getShellPath(), "/bin/bash");
    delete process.env.SHELL;
    assert.equal(getShellPath(), "/bin/sh");
  } finally {
    if (prev === undefined) delete process.env.SHELL;
    else process.env.SHELL = prev;
  }
});

test("bash-mode-actions: getShellCwd prefers the live session, then ctx, then process", () => {
  const withSession = { shellSession: { state: { cwd: "/session/cwd" } }, currentCtx: { cwd: "/ctx/cwd" } };
  assert.equal(getShellCwd(withSession as never), "/session/cwd");

  const withCtx = { shellSession: null, currentCtx: { cwd: "/ctx/cwd" } };
  assert.equal(getShellCwd(withCtx as never), "/ctx/cwd");

  const bare = { shellSession: null, currentCtx: null };
  assert.equal(getShellCwd(bare as never), process.cwd());
});

test("bash-mode-actions: getShellHistoryEntries merges project and global without duplicates", () => {
  const rt = { currentCtx: { cwd: "/definitely/not/a/real/project-xyz" } };
  const entries = getShellHistoryEntries(rt as never, "");
  // No project history exists for this path; whatever the global shell
  // history holds, it must be unique.
  assert.equal(new Set(entries).size, entries.length);
  // A specific prefix filters both sources.
  const filtered = getShellHistoryEntries(rt as never, "zzz-no-such-command");
  assert.deepEqual(filtered, []);
});
