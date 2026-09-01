import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PowerlineQueueStore, currentQueueContext } from "../queue/store.ts";
import { createRuntimeState } from "../src/extension/core/state.ts";
import { registerSessionLifecycle } from "../src/extension/session/session-lifecycle.ts";

function fakePi() {
  const handlers = new Map<string, Array<(event: any, ctx: any) => unknown>>();
  return { handlers, on(event: string, handler: (event: any, ctx: any) => unknown) { handlers.set(event, [...(handlers.get(event) ?? []), handler]); } };
}

test("session_compact_failed clears compacting state and blocks post-compact queue", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wishcraft-compact-failed-"));
  try {
    const rt = createRuntimeState({});
    rt.queueStore = new PowerlineQueueStore(join(dir, "inbox.jsonl"), join(dir, "projects.json"), join(dir, "archive.jsonl"));
    rt.powerlineCompacting = true;
    rt.deliverAfterRetrySettles = true;
    rt.queueStore.add({ text: "after compact", source: { cwd: dir, sessionId: "s1" }, target: { kind: "current-session" }, intent: "post-compact" });
    const pi = fakePi();
    registerSessionLifecycle(pi as never, rt);
    const handler = pi.handlers.get("session_compact_failed")?.[0];
    assert.ok(handler);
    const notices: string[] = [];
    await handler({ errorMessage: "boom" }, { cwd: dir, sessionManager: { getSessionId: () => "s1" }, ui: { notify(message: string) { notices.push(message); } } });
    assert.equal(rt.powerlineCompacting, false);
    assert.equal(rt.deliverAfterRetrySettles, false);
    assert.equal(rt.signal.event, "error");
    const queued = rt.queueStore.activeItems(currentQueueContext(dir, "s1"));
    assert.equal(queued.length, 1);
    assert.equal(queued[0]?.status, "blocked");
    assert.equal(queued[0]?.error, "boom");
    assert.equal(notices.length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("session_compact_failed without error settles signal to idle", async () => {
  const rt = createRuntimeState({});
  rt.powerlineCompacting = true;
  const pi = fakePi();
  registerSessionLifecycle(pi as never, rt);
  const handler = pi.handlers.get("session_compact_failed")?.[0];
  assert.ok(handler);
  await handler({}, { cwd: "/tmp", ui: { notify() {} } });
  assert.equal(rt.powerlineCompacting, false);
  assert.equal(rt.signal.event, "idle");
});
