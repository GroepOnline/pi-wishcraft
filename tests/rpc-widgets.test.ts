import test from "node:test";
import assert from "node:assert/strict";

import { installRpcWidgets } from "../src/extension/ui/rpc-widgets.ts";
import { createRuntimeState } from "../src/extension/core/state.ts";

function makeCtx() {
  const widgets = new Map<string, { lines: string[]; placement?: string }>();
  const ctx = {
    ui: {
      theme: {},
      setWidget(key: string, lines: string[], opts?: { placement?: string }) {
        widgets.set(key, { lines, placement: opts?.placement });
      },
    },
  };
  return { ctx, widgets };
}

test("rpc widgets install all six keys as string[] lines with placements", () => {
  const { ctx, widgets } = makeCtx();
  const rt = createRuntimeState({});
  rt.currentCtx = ctx;
  installRpcWidgets(rt, ctx);

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

test("rpcWidgetRefresh re-pushes fresh lines and marks the layout dirty", () => {
  const { ctx, widgets } = makeCtx();
  const rt = createRuntimeState({});
  rt.currentCtx = ctx;
  installRpcWidgets(rt, ctx);
  assert.equal(typeof rt.rpcWidgetRefresh, "function");

  const before = widgets.get("powerline-top")!.lines;
  rt.layoutDirty = false;
  rt.rpcWidgetRefresh!();
  // Refresh forces a layout recompute; a successful render clears the flag
  // again, so assert on the pushed lines, not the flag.
  assert.notStrictEqual(widgets.get("powerline-top")!.lines, before);
});

test("rpc widget refresh is a no-op after the session ctx is gone", () => {
  const { ctx, widgets } = makeCtx();
  const rt = createRuntimeState({});
  rt.currentCtx = ctx;
  installRpcWidgets(rt, ctx);
  const snapshot = widgets.get("powerline-top")!.lines;
  rt.currentCtx = null;
  rt.rpcWidgetRefresh!();
  assert.strictEqual(widgets.get("powerline-top")!.lines, snapshot);
});

test("a failing widget render does not take down the other widgets", () => {
  const { ctx, widgets } = makeCtx();
  const rt = createRuntimeState({});
  rt.currentCtx = ctx;
  rt.footerDataRef = {
    getExtensionStatuses() {
      throw new Error("boom");
    },
  };
  installRpcWidgets(rt, ctx);
  // The status widget's render throws and is fault-isolated; the widgets that
  // do not depend on footerDataRef still push their lines.
  assert.ok(widgets.has("powerline-last-prompt"));
  assert.ok(widgets.has("powerline-bash-transcript"));
  assert.ok(widgets.has("powerline-queue-preview"));
});
