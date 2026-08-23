import test from "node:test";
import assert from "node:assert/strict";
import { parsePolicySettings } from "../src/extension/hooks/policy-config.ts";

test("parsePolicySettings: enabled by default when policy is non-empty", () => {
  const parsed = parsePolicySettings({
    policy: [
      {
        action: "deny",
        tool: "bash",
        match: "sudo\\s+rm",
        reason: "destructive sudo rm",
      },
    ],
  });
  assert.equal(parsed.enabled, true);
  assert.equal(parsed.rules.length, 1);
  assert.equal(parsed.rules[0]!.action, "deny");
});

test("parsePolicySettings: policyEnabled false is kill-switch", () => {
  const parsed = parsePolicySettings({
    policyEnabled: false,
    policy: [
      {
        action: "deny",
        tool: "bash",
        match: "rm",
        reason: "no",
      },
    ],
  });
  assert.equal(parsed.enabled, false);
  assert.equal(parsed.rules.length, 1);
});

test("parsePolicySettings: drops malformed rules", () => {
  const parsed = parsePolicySettings({
    policy: [
      { action: "deny", tool: "bash", match: "ok", reason: "fine" },
      { action: "deny", tool: "bash", match: "[invalid", reason: "bad regex" },
      { action: "inject", tool: "read", pathMatch: "\\.env", context: "warn" },
      { action: "inject", tool: "read" }, // missing fields
      { action: "spawn", tool: "bash" }, // unknown action
      "nonsense",
    ],
  });
  assert.equal(parsed.rules.length, 2);
  assert.deepEqual(
    parsed.rules.map((r) => r.action),
    ["deny", "inject"],
  );
});

test("parsePolicySettings: empty or missing policy is disabled", () => {
  assert.deepEqual(parsePolicySettings(undefined), { enabled: false, rules: [] });
  assert.deepEqual(parsePolicySettings({ policy: [] }), { enabled: false, rules: [] });
  assert.deepEqual(parsePolicySettings({ policy: ["bad"] }), { enabled: false, rules: [] });
});
