import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setupHooks } from "../src/extension/hooks/index.ts";

async function withHooks(
  wishcraft: Record<string, unknown>,
  run: (handlers: Map<string, Function>) => Promise<void>,
) {
  const dir = await mkdtemp(join(tmpdir(), "wishcraft-policy-"));
  const agentDir = join(dir, "agent");
  await mkdir(agentDir);
  await writeFile(join(agentDir, "settings.json"), JSON.stringify({ wishcraft }));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  const handlers = new Map<string, Function>();
  const pi = { on: (event: string, handler: Function) => handlers.set(event, handler) } as any;
  try {
    setupHooks(pi, {} as any, dir);
    await run(handlers);
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
}

test("setupHooks denies before command hooks", async () => {
  await withHooks({
    policy: [{ action: "deny", tool: "bash", match: "rm", reason: "blocked" }],
    hooks: { preToolUse: [{ command: "should-not-run" }] },
  }, async (handlers) => {
    const result = await handlers.get("tool_call")!({ toolName: "bash", input: { command: "rm x" } }, {});
    assert.deepEqual(result, { block: true, reason: "blocked" });
  });
});

test("setupHooks kill switch disables deny and inject", async () => {
  await withHooks({
    policyEnabled: false,
    policy: [
      { action: "deny", tool: "bash", match: "rm", reason: "blocked" },
      { action: "inject", tool: "read", pathMatch: "\\.env", context: "secret" },
    ],
  }, async (handlers) => {
    assert.equal(await handlers.get("tool_call")!({ toolName: "bash", input: { command: "rm x" } }, {}), undefined);
    const result = await handlers.get("tool_result")!({ toolName: "read", input: { path: ".env" }, content: [{ type: "text", text: "x" }] }, {});
    assert.equal(result, undefined);
  });
});

test("setupHooks appends injected context to tool results", async () => {
  await withHooks({
    policy: [{ action: "inject", tool: "read", pathMatch: "\\.env", context: "secret" }],
  }, async (handlers) => {
    const result = await handlers.get("tool_result")!({ toolName: "read", input: { path: ".env" }, content: [{ type: "text", text: "x" }] }, {});
    assert.deepEqual(result.content.at(-1), { type: "text", text: "secret" });
  });
});
