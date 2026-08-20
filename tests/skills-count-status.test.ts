import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createRuntimeState } from "../src/extension/core/state.ts";
import { POWERLINE_STATUS_KEYS } from "../src/extension/core/status-export.ts";
import { registerSessionLifecycle } from "../src/extension/session/session-lifecycle.ts";
import {
  invalidateSkillCache,
} from "../src/extension/skills/skill-registry.ts";
import { clearSkillsCountPublisher } from "../src/extension/skills/skill-status.ts";

function fakePi() {
  const handlers = new Map<
    string,
    Array<(event: unknown, ctx: unknown) => unknown>
  >();
  return {
    handlers,
    on(event: string, handler: (event: unknown, ctx: unknown) => unknown) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
  };
}

test("session_start publishes skills.count and cache invalidation refreshes it", async () => {
  const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
  const agentDir = mkdtempSync(join(tmpdir(), "wishcraft-skills-count-"));
  const cwd = mkdtempSync(join(tmpdir(), "wishcraft-skills-count-cwd-"));
  mkdirSync(join(agentDir, "skills"), { recursive: true });
  writeFileSync(join(agentDir, "settings.json"), "{}\n");
  writeFileSync(
    join(agentDir, "skills", "alpha.md"),
    "---\nname: alpha\ndescription: one\n---\nbody\n",
  );
  process.env.PI_CODING_AGENT_DIR = agentDir;
  try {
    const writes: Array<[string, string | undefined]> = [];
    const pi = fakePi();
    const rt = createRuntimeState({});
    rt.enabled = false;
    registerSessionLifecycle(pi as never, rt);
    const start = pi.handlers.get("session_start")?.[0];
    const shutdown = pi.handlers.get("session_shutdown")?.[0];
    assert.ok(start);
    assert.ok(shutdown);

    const ctx = {
      cwd,
      hasUI: true,
      ui: {
        setStatus: (key: string, value: string | undefined) => {
          writes.push([key, value]);
        },
        notify: () => {},
      },
    };

    await start({ reason: "new" }, ctx);
    const published = writes.filter(
      ([key]) => key === POWERLINE_STATUS_KEYS.skillsCount,
    );
    assert.deepEqual(published.at(-1), [POWERLINE_STATUS_KEYS.skillsCount, "1"]);

    writes.length = 0;
    writeFileSync(
      join(agentDir, "skills", "beta.md"),
      "---\nname: beta\ndescription: two\n---\nbody\n",
    );
    invalidateSkillCache();
    assert.deepEqual(writes, [[POWERLINE_STATUS_KEYS.skillsCount, "2"]]);

    writes.length = 0;
    await shutdown({}, ctx);
    invalidateSkillCache();
    assert.deepEqual(writes, []);
  } finally {
    clearSkillsCountPublisher();
    invalidateSkillCache();
    if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
    rmSync(agentDir, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  }
});
