import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  appendReadHintToEvent,
  coreReadResultHasRangeSummary,
  formatReadHint,
  readHintsEnabled,
  shouldAppendReadHint,
} from "../src/extension/session/read-hints.ts";
import { createRuntimeState } from "../src/extension/core/state.ts";
import { registerSessionLifecycle } from "../src/extension/session/session-lifecycle.ts";
import { buildConfigGroups } from "../src/extension/settings/wishcraft-config.ts";

const cases: Array<{
  name: string;
  input: { offset?: number; limit?: number } | undefined;
  text: string;
  details?: { truncation?: { totalLines?: number } };
  append: boolean;
  hint?: string;
}> = [
  {
    name: "full file read without offset or limit",
    input: {},
    text: "alpha\nbeta\ngamma",
    append: false,
  },
  {
    name: "core already includes a showing-lines summary",
    input: { offset: 10, limit: 5 },
    text: "line ten\nline eleven\n\n[Showing lines 10-14 of 100. Use offset=15 to continue.]",
    append: false,
  },
  {
    name: "core already includes a use-offset footer",
    input: { offset: 20 },
    text: "payload\n\n[42 more lines in file. Use offset=25 to continue.]",
    append: false,
  },
  {
    name: "range wording in the file body is not a core footer",
    input: { offset: 1, limit: 3 },
    text: "Use offset=99 to continue.\nsecond\nthird",
    details: { truncation: { totalLines: 50 } },
    append: true,
    hint: "50 lines, showing 1–3, next offset 4",
  },
  {
    name: "footer-like source on the last line still gets a hint",
    input: { offset: 1, limit: 2 },
    text: "first\nUse offset=15 to continue.",
    details: { truncation: { totalLines: 40 } },
    append: true,
    hint: "40 lines, showing 1–2, next offset 3",
  },
  {
    name: "partial read needs a hint when core stayed quiet",
    input: { offset: 10, limit: 5 },
    text: "line ten\nline eleven\nline twelve\nline thirteen\nline fourteen",
    details: { truncation: { totalLines: 100 } },
    append: true,
    hint: "100 lines, showing 10–14, next offset 15",
  },
  {
    name: "partial read at eof does not need a hint",
    input: { offset: 98, limit: 5 },
    text: "ninety-eight\nninety-nine\none hundred",
    details: { truncation: { totalLines: 100 } },
    append: false,
  },
  {
    name: "limit shorter than requested means eof",
    input: { offset: 1, limit: 10 },
    text: "only\nthree\nlines",
    append: false,
  },
];

for (const c of cases) {
  test(`shouldAppendReadHint: ${c.name}`, () => {
    assert.equal(shouldAppendReadHint(c.input, c.text, c.details), c.append);
    if (c.hint) {
      assert.equal(formatReadHint(c.input!, c.text, c.details), c.hint);
    }
  });
}

test("formatReadHint falls back without total line count", () => {
  assert.equal(
    formatReadHint({ offset: 3, limit: 2 }, "c\n d"),
    "2 lines, showing 3–4, next offset 5",
  );
});

test("core range summary is detected only as a generated footer", () => {
  assert.equal(
    coreReadResultHasRangeSummary("Use offset=15 to continue.\nactual body"),
    false,
  );
  assert.equal(
    coreReadResultHasRangeSummary("actual body\nUse offset=15 to continue."),
    false,
  );
  assert.equal(
    coreReadResultHasRangeSummary(
      "actual body\n[Showing lines 10-14 of 100. Use offset=15 to continue.]",
    ),
    true,
  );
});

test("readHintsEnabled is on by default and honors an explicit opt-out", () => {
  assert.equal(readHintsEnabled(undefined), true);
  assert.equal(readHintsEnabled({}), true);
  assert.equal(readHintsEnabled({ readHints: false }), false);
});

test("appendReadHintToEvent copies content and leaves input untouched", () => {
  const input = { offset: 10, limit: 5 };
  const content = [
    {
      type: "text",
      text: "line ten\nline eleven\nline twelve\nline thirteen\nline fourteen",
    },
  ];
  const result = appendReadHintToEvent({
    input,
    content,
    details: { truncation: { totalLines: 100 } },
  });
  assert.equal(input.offset, 10);
  assert.equal(input.limit, 5);
  assert.equal(content.length, 1);
  assert.equal(result?.content.length, 2);
  assert.match(String((result?.content[1] as { text: string }).text), /next offset 15/);
});

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

test("tool_result handler appends a read hint without mutating input", async () => {
  const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
  const agentDir = mkdtempSync(join(tmpdir(), "wishcraft-read-hints-"));
  writeFileSync(join(agentDir, "settings.json"), "{}\n");
  process.env.PI_CODING_AGENT_DIR = agentDir;
  try {
    const pi = fakePi();
    registerSessionLifecycle(pi as never, createRuntimeState({}));
    const handler = pi.handlers.get("tool_result")?.[0];
    assert.ok(handler);
    const input = { offset: 10, limit: 5 };
    const content = [
      {
        type: "text",
        text: "line ten\nline eleven\nline twelve\nline thirteen\nline fourteen",
      },
    ];
    const result = (await handler(
      {
        toolName: "read",
        input,
        content,
        details: { truncation: { totalLines: 100 } },
      },
      { cwd: agentDir },
    )) as { content: Array<{ text?: string }> } | undefined;
    assert.equal(input.offset, 10);
    assert.equal(content.length, 1);
    assert.equal(result?.content.length, 2);
    assert.match(String(result?.content[1]?.text), /next offset 15/);
  } finally {
    if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
    rmSync(agentDir, { recursive: true, force: true });
  }
});

test("tool_result handler respects wishcraft.readHints false", async () => {
  const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
  const agentDir = mkdtempSync(join(tmpdir(), "wishcraft-read-hints-off-"));
  writeFileSync(
    join(agentDir, "settings.json"),
    JSON.stringify({ wishcraft: { readHints: false } }),
  );
  process.env.PI_CODING_AGENT_DIR = agentDir;
  try {
    const pi = fakePi();
    registerSessionLifecycle(pi as never, createRuntimeState({}));
    const handler = pi.handlers.get("tool_result")?.[0];
    assert.ok(handler);
    const result = await handler(
      {
        toolName: "read",
        input: { offset: 10, limit: 5 },
        content: [
          {
            type: "text",
            text: "line ten\nline eleven\nline twelve\nline thirteen\nline fourteen",
          },
        ],
        details: { truncation: { totalLines: 100 } },
      },
      { cwd: agentDir },
    );
    assert.equal(result, undefined);
  } finally {
    if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
    rmSync(agentDir, { recursive: true, force: true });
  }
});

test("Skills config group exposes the readHints toggle", () => {
  const skills = buildConfigGroups({}).find((group) => group.title === "Skills");
  const item = skills?.items.find((entry) => entry.path === "wishcraft.readHints");
  assert.equal(item?.kind, "toggle");
  assert.equal(item?.label, "Read hints");
});
