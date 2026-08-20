import test from "node:test";
import assert from "node:assert/strict";
import {
  commandsFor,
  hookMatchesTool,
  parseHooksSettings,
} from "../src/extension/hooks/hooks-config.ts";
import {
  preToolUseVerdict,
  runHookCommand,
  type HookOutput,
} from "../src/extension/hooks/hooks-runner.ts";
import { repairToolInput } from "../src/extension/hooks/repairs.ts";

function out(partial: Partial<HookOutput>): HookOutput {
  return { exitCode: 0, parsed: null, stderrFirstLine: "", ...partial };
}

test("parseHooksSettings validates and drops malformed hooks", () => {
  const parsed = parseHooksSettings({
    hooksEnabled: true,
    hooks: {
      preToolUse: [
        { matcher: "bash", hooks: [{ command: "guard.sh", timeout: 999 }] },
        { matcher: "x", hooks: [] }, // leeg → weg
        { hooks: [{ command: "" }] }, // leeg command → weg
        "nonsense", // geen object → weg
      ],
      postToolUse: "geen array", // weg
    },
  });
  assert.equal(parsed.enabled, true);
  const cmds = commandsFor(parsed.hooks, "preToolUse", "bash");
  assert.equal(cmds.length, 1);
  assert.equal(cmds[0]!.command, "guard.sh");
  assert.equal(cmds[0]!.timeout, 600); // afgekapt naar max
});

test("parseHooksSettings disabled by default without config", () => {
  const parsed = parseHooksSettings(undefined);
  assert.equal(parsed.enabled, false);
  assert.equal(commandsFor(parsed.hooks, "preToolUse", "bash").length, 0);
});

test("hookMatchesTool supports regex and empty matcher", () => {
  assert.equal(hookMatchesTool(undefined, "bash"), true);
  assert.equal(hookMatchesTool("bash", "bash"), true);
  assert.equal(hookMatchesTool("bash", "read"), false);
  assert.equal(hookMatchesTool("read|write", "write"), true);
  assert.equal(hookMatchesTool("^my_tool$", "my_tool"), true);
  assert.equal(hookMatchesTool("^my_tool$", "my_tool_extra"), false);
});

test("commandsFor filters by matcher and preserves order", () => {
  const { hooks } = parseHooksSettings({
    hooks: {
      preToolUse: [
        { hooks: [{ command: "all.sh" }] },
        { matcher: "bash", hooks: [{ command: "bash1.sh" }, { command: "bash2.sh" }] },
      ],
    },
  });
  const forBash = commandsFor(hooks, "preToolUse", "bash");
  assert.deepEqual(forBash.map((c) => c.command), ["all.sh", "bash1.sh", "bash2.sh"]);
  const forRead = commandsFor(hooks, "preToolUse", "read");
  assert.deepEqual(forRead.map((c) => c.command), ["all.sh"]);
});

test("preToolUseVerdict: exit 2 denies with stderr reason", () => {
  const v = preToolUseVerdict(out({ exitCode: 2, stderrFirstLine: "dangerous" }));
  assert.deepEqual(v, { deny: true, reason: "dangerous" });
});

test("preToolUseVerdict: exit 2 prefers stdout permissionDecisionReason", () => {
  const v = preToolUseVerdict(
    out({
      exitCode: 2,
      stderrFirstLine: "stderr",
      parsed: {
        hookSpecificOutput: { permissionDecision: "deny", permissionDecisionReason: "policy" },
      },
    }),
  );
  assert.deepEqual(v, { deny: true, reason: "policy" });
});

test("runHookCommand ignores EPIPE when a deny hook exits before reading stdin", async () => {
  const result = await runHookCommand(
    { command: "printf 'spawned\\n' >&2; exit 2" },
    {
      session_id: "s",
      cwd: process.cwd(),
      hook_event_name: "preToolUse",
      permission_mode: "default",
    },
  );
  assert.equal(result.exitCode, 2);
  assert.match(result.stderrFirstLine, /spawned/);
});

test("preToolUseVerdict: allow paths do not deny", () => {
  assert.equal(preToolUseVerdict(out({ exitCode: 0 })).deny, false);
  assert.equal(
    preToolUseVerdict(
      out({ parsed: { hookSpecificOutput: { permissionDecision: "allow" } } }),
    ).deny,
    false,
  );
  // exit 0 met garbage-stdout → geen mening
  assert.equal(preToolUseVerdict(out({ exitCode: 0, parsed: null })).deny, false);
});

test("repairToolInput removes null-valued optional fields (custom tools only)", () => {
  const input: Record<string, unknown> = { path: "a.ts", timeoutMs: null, keep: "x" };
  const result = repairToolInput("my_tool", input);
  assert.deepEqual(input, { path: "a.ts", keep: "x" });
  assert.deepEqual(result.repairs, ["null-for-optional:timeoutMs"]);
});

test("repairToolInput unwraps degenerate markdown auto-links", () => {
  const input: Record<string, unknown> = {
    file_path: "[notes.md](http://notes.md)",
    label: "[click](https://x.com)",
  };
  const result = repairToolInput("my_tool", input);
  assert.equal(input.path, "notes.md");
  assert.equal(input.file_path, undefined);
  assert.equal(input.label, "[click](https://x.com)"); // echte link blijft
  assert.ok(result.repairs.includes("path-alias:file_path"));
  assert.ok(result.repairs.includes("auto-link-unwrap:path"));
});

test("repairToolInput parses JSON-string arrays before wrapping", () => {
  const input: Record<string, unknown> = { files: '["a.ts","b.ts"]' };
  const result = repairToolInput("my_tool", input);
  assert.deepEqual(input.files, ["a.ts", "b.ts"]);
  assert.deepEqual(result.repairs, ["json-string-array:files"]);
});

test("repairToolInput wraps a bare string on array keys and empties {}", () => {
  const input: Record<string, unknown> = { files: "solo.ts", items: {} };
  const result = repairToolInput("my_tool", input);
  assert.deepEqual(input.files, ["solo.ts"]);
  assert.deepEqual(input.items, []);
  assert.ok(result.repairs.includes("bare-string-wrap:files"));
  assert.ok(result.repairs.includes("empty-object-placeholder:items"));
});

test("repairToolInput aliases filePath to path", () => {
  const input: Record<string, unknown> = { filePath: "src/a.ts" };
  const result = repairToolInput("ext_tool", input);
  assert.equal(input.path, "src/a.ts");
  assert.equal(input.filePath, undefined);
  assert.deepEqual(result.repairs, ["path-alias:filePath"]);
});

test("repairToolInput skips pi core tools", () => {
  const input: Record<string, unknown> = { command: "ls", x: null };
  const result = repairToolInput("bash", input);
  assert.deepEqual(result.repairs, []);
  assert.equal(input.x, null);
});
