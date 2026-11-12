import test from "node:test";
import assert from "node:assert/strict";

import { disposeRpcWidgets, installRpcWidgets } from "../src/extension/ui/rpc-widgets.ts";
import { createRuntimeState } from "../src/extension/core/state.ts";

function makeCtx() {
  const widgets = new Map<string, { lines: string[]; placement?: string }>();
  const statuses = new Map<string, string>();
  const ctx = {
    ui: {
      theme: {},
      setWidget(key: string, lines: string[], opts?: { placement?: string }) {
        widgets.set(key, { lines, placement: opts?.placement });
      },
      setStatus(key: string, text: string | undefined) {
        if (text === undefined) statuses.delete(key);
        else statuses.set(key, text);
      },
    },
  };
  return { ctx, widgets, statuses };
}

test.afterEach(() => disposeRpcWidgets());

test("rpc widgets install all six keys as string[] lines with placements", () => {
  const { ctx, widgets } = makeCtx();
  const rt = createRuntimeState({});
  rt.currentCtx = ctx;
  installRpcWidgets(rt, ctx as never);

  for (const key of [
    "powerline-status",
    "powerline-top",
    "powerline-secondary",
    "powerline-bash-transcript",
    "powerline-queue-preview",
    "powerline-last-prompt",
  ]) {
    assert.ok(widgets.has(key), `missing widget ${key}`);
    assert.ok(Array.isArray(widgets.get(key)!.lines));
    assert.match(widgets.get(key)!.placement ?? "", /^(aboveEditor|belowEditor)$/);
  }
  assert.equal(widgets.get("powerline-status")!.placement, "aboveEditor");
  assert.equal(widgets.get("powerline-secondary")!.placement, "belowEditor");
});

test("rpc installs a footer data provider: branch fallback and status mirror", () => {
  const { ctx } = makeCtx();
  const rt = createRuntimeState({});
  rt.currentCtx = ctx;
  installRpcWidgets(rt, ctx as never);

  assert.ok(rt.footerDataRef, "rpc must provide a footer data provider");
  assert.ok(rt.footerDataRef!.getExtensionStatuses() instanceof Map);
  assert.equal(rt.footerDataRef!.getAvailableProviderCount(), 0);
  // Branch read goes through our own git-status cache, not a TUI footer.
  const branch = rt.footerDataRef!.getGitBranch();
  assert.ok(branch === null || typeof branch === "string");

  // setStatus is mirrored into the provider so notification statuses render.
  ctx.ui.setStatus("otherext.notice", "hello from another extension");
  assert.equal(
    rt.footerDataRef!.getExtensionStatuses().get("otherext.notice"),
    "hello from another extension",
  );
  ctx.ui.setStatus("otherext.notice", undefined);
  assert.equal(
    rt.footerDataRef!.getExtensionStatuses().has("otherext.notice"),
    false,
  );
});

test("rpcWidgetRefresh re-pushes fresh lines after a state change", () => {
  const { ctx, widgets } = makeCtx();
  const rt = createRuntimeState({});
  rt.currentCtx = ctx;
  installRpcWidgets(rt, ctx as never);
  assert.equal(typeof rt.rpcWidgetRefresh, "function");

  const before = widgets.get("powerline-last-prompt")!.lines;
  rt.lastUserPrompt = "hello keyword world";
  rt.rpcWidgetRefresh!();
  const after = widgets.get("powerline-last-prompt")!.lines;
  assert.notDeepEqual(after, before, "changed state must change pushed lines");
  assert.ok(after[0]!.includes("hello keyword world"));
});

test("rpc widget refresh is a no-op after the session ctx is gone", () => {
  const { ctx, widgets } = makeCtx();
  const rt = createRuntimeState({});
  rt.currentCtx = ctx;
  installRpcWidgets(rt, ctx as never);
  const snapshot = widgets.get("powerline-top")!.lines;
  rt.currentCtx = null;
  rt.rpcWidgetRefresh!();
  assert.strictEqual(widgets.get("powerline-top")!.lines, snapshot);
});

test("dispose tears down the provider, refresh hook and status mirror", () => {
  const { ctx } = makeCtx();
  const rt = createRuntimeState({});
  rt.currentCtx = ctx;
  installRpcWidgets(rt, ctx as never);
  const provider = rt.footerDataRef;
  disposeRpcWidgets();
  assert.equal(rt.rpcWidgetRefresh, null);
  assert.equal(rt.footerDataRef, null);
  // Status calls still reach the host, just no longer mirrored.
  ctx.ui.setStatus("late", "x");
  assert.equal(provider!.getExtensionStatuses().has("late"), false);
});
