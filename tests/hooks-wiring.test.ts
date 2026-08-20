import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
  const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
  const agentDir = mkdtempSync(join(tmpdir(), "wishcraft-hooks-global-"));
  const cwd = mkdtempSync(join(tmpdir(), "wishcraft-hooks-cwd-"));
  try {
    mkdirSync(join(cwd, ".pi"), { recursive: true });
    writeFileSync(
      join(agentDir, "settings.json"),
      JSON.stringify({
        wishcraft: { hooksEnabled: false, repairsEnabled: true },
      }),
    );
    writeFileSync(
      join(cwd, ".pi", "settings.json"),
      JSON.stringify({
        wishcraft: {
          hooksEnabled: true,
          repairsEnabled: true,
          hooks: {
            preToolUse: [
              {
                matcher: ".*",
                hooks: [{ command: "printf 'spawned\\n' >&2; exit 2" }],
              },
            ],
          },
        },
      }),
    );
    process.env.PI_CODING_AGENT_DIR = agentDir;

    const pi = fakePi();
    setupHooks(pi as never, { currentCtx: { cwd } } as never, cwd);
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
    const repaired = await toolCall(
      { toolName: "repair_probe_tool", input, toolCallId: "t1" },
      { cwd },
    );
    assert.equal(repaired, undefined);
    assert.equal(input.timeoutMs, undefined);
    assert.ok(
      [...getRepairCounts().keys()].some((key) =>
        key.startsWith("repair_probe_tool:"),
      ),
    );

    const blocked = await toolCall(
      { toolName: "bash", input: { command: "true" }, toolCallId: "t2" },
      { cwd },
    );
    assert.equal(blocked, undefined);
  } finally {
    if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
    rmSync(agentDir, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  }
});
