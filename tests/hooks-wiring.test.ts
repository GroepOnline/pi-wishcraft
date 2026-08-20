import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getRepairCounts, setupHooks } from "../src/extension/hooks/index.ts";

const root = join(import.meta.dirname, "..");

test("activate.ts registers setupHooks so command hooks and repairs are live", () => {
  const source = readFileSync(
    join(root, "src/extension/session/activate.ts"),
    "utf8",
  );
  assert.match(source, /from "\.\.\/hooks\/index\.ts"/);
  assert.match(source, /setupHooks\(\s*pi,\s*rt,\s*process\.cwd\(\)\s*\)/);
});

function fakePi() {
  const handlers = new Map<string, Array<(event: unknown, ctx: unknown) => unknown>>();
  return {
    handlers,
    on(event: string, handler: (event: unknown, ctx: unknown) => unknown) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
  };
}

test("setupHooks registers the harness events and records custom-tool repairs", async () => {
  const pi = fakePi();
  setupHooks(pi as never, { currentCtx: null } as never, process.cwd());
  for (const event of [
    "session_start",
    "context",
    "tool_call",
    "tool_result",
    "turn_end",
  ]) {
    assert.ok(
      (pi.handlers.get(event)?.length ?? 0) > 0,
      `expected a ${event} handler`,
    );
  }

  const toolCall = pi.handlers.get("tool_call")![0]!;
  const input: Record<string, unknown> = { path: "a.ts", timeoutMs: null };
  await toolCall({ toolName: "my_tool", input, toolCallId: "t1" }, {});
  assert.equal(input.timeoutMs, undefined);
  assert.ok(
    [...getRepairCounts().keys()].some((key) => key.startsWith("my_tool:")),
  );
});
