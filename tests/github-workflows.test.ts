import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const workflowsDir = join(root, ".github/workflows");
const HOSTED_RUNNER = /^\s*runs-on:\s*.*(ubuntu-latest|macos-latest|windows-latest)/;
const FLEET_PR_OR_HEAVY =
  "runs-on: ${{ github.event_name == 'pull_request' && fromJSON('[\"self-hosted\",\"Linux\",\"X64\",\"pr-isolated\"]') || fromJSON('[\"self-hosted\",\"Linux\",\"X64\",\"heavy\"]') }}";
const FLEET_HEAVY = "runs-on: [self-hosted, Linux, X64, heavy]";

test(".github/workflows forbid GitHub-hosted runners", () => {
  for (const name of readdirSync(workflowsDir)) {
    if (!name.endsWith(".yml")) continue;
    const text = readFileSync(join(workflowsDir, name), "utf8");
    for (const line of text.split("\n")) {
      assert.doesNotMatch(line, HOSTED_RUNNER, `${name}: ${line}`);
    }
  }
});

test("mixed-trigger workflows use pr-isolated or heavy", () => {
  const testWorkflow = readFileSync(join(workflowsDir, "test.yml"), "utf8");
  const preview = readFileSync(join(workflowsDir, "preview.yml"), "utf8");
  assert.ok(testWorkflow.includes(FLEET_PR_OR_HEAVY));
  assert.ok(preview.includes(FLEET_PR_OR_HEAVY));
});

test("dispatch-only workflows use heavy", () => {
  const promote = readFileSync(join(workflowsDir, "promote-release-candidate.yml"), "utf8");
  const deprecate = readFileSync(join(workflowsDir, "deprecate-old-name.yml"), "utf8");
  assert.ok(promote.includes(FLEET_HEAVY));
  assert.ok(deprecate.includes(FLEET_HEAVY));
});

test(".github/workflows/test.yml limits GITHUB_TOKEN to contents: read", () => {
  const workflow = readFileSync(join(root, ".github/workflows/test.yml"), "utf8");
  assert.match(workflow, /^permissions:\n  contents: read\n/m);
  assert.doesNotMatch(workflow, /id-token:\s*write/);
});
