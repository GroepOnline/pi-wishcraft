import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * GitHub Actions gives almost no signal when a workflow file will not parse.
 * The run is created, fails in 0s with **zero jobs and no logs**, and the only
 * clue is the workflow's name reverting to its file path in the API.
 *
 * That is exactly how `test.yml` broke: a step name edited to
 * `- name: Unit tests (coverage threshold: 70% lines / 60% functions)`. The
 * `: ` inside an unquoted plain scalar is read as a nested mapping, so the
 * whole file became invalid — and `release.yml`, which calls `test.yml` via
 * `workflow_call`, failed the same way, so the release pipeline died silently.
 *
 * These checks run locally in under a second; the thing they guard against
 * only surfaces on GitHub, minutes later, after a push.
 */

const REPO_ROOT = resolve(import.meta.dirname, "..");
const WORKFLOW_DIR = join(REPO_ROOT, ".github/workflows");

/** Keys whose value is a plain YAML scalar and therefore colon-sensitive. */
const SCALAR_KEYS = ["name", "run", "if", "uses", "shell", "working-directory"];

function workflowFiles(): string[] {
  if (!existsSync(WORKFLOW_DIR)) return [];
  return readdirSync(WORKFLOW_DIR)
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .map((f) => join(WORKFLOW_DIR, f));
}

/** A `key: value` line whose value is neither quoted nor a block scalar. */
function unquotedScalarWithColonSpace(line: string): string | null {
  const match = new RegExp(
    String.raw`^\s*-?\s*(?:${SCALAR_KEYS.join("|")})\s*:\s+(.*)$`,
  ).exec(line);
  if (!match) return null;

  const value = match[1]!.trimEnd();
  if (value === "") return null;
  // Already quoted -> safe. Block scalars and empty values are not affected.
  if (/^["'].*["']$/.test(value)) return null;
  if (value.startsWith("|") || value.startsWith(">")) return null;
  // A trailing comment is not part of the scalar.
  const withoutComment = value.replace(/\s+#.*$/, "").trimEnd();
  // `: ` (colon+space) or a trailing `:` is what makes YAML read a nested map.
  if (/:(\s|$)/.test(withoutComment)) return line;
  return null;
}

test("no workflow step scalar has an unquoted colon-space", () => {
  const offenders: string[] = [];
  for (const file of workflowFiles()) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      const bad = unquotedScalarWithColonSpace(line);
      if (bad) {
        offenders.push(
          `  .github/workflows/${file.split("/").pop()}:${index + 1}: ${bad.trim()}`,
        );
      }
    });
  }
  assert.deepEqual(
    offenders,
    [],
    "quote these scalars. An unquoted \": \" makes the workflow unparseable, " +
      "which fails every run with zero jobs and no logs.\n" + offenders.join("\n"),
  );
});

test("every workflow declares a name and at least one job", () => {
  const problems: string[] = [];
  for (const file of workflowFiles()) {
    const text = readFileSync(file, "utf8");
    const base = file.split("/").pop();
    if (!/^name:\s*\S/m.test(text)) problems.push(`${base}: missing a top-level name:`);
    if (!/^on:/m.test(text)) problems.push(`${base}: missing an on: trigger block`);
    if (!/^jobs:\s*$/m.test(text)) problems.push(`${base}: missing a jobs: block`);
  }
  assert.deepEqual(problems, [], problems.join("\n"));
});

test("the release workflow triggers on main pushes and calls the verify workflow", () => {
  // release.yml delegates to test.yml, so a break in either silently stops all
  // releases. These two couplings are what make the failure invisible.
  const text = readFileSync(join(WORKFLOW_DIR, "release.yml"), "utf8");
  assert.match(text, /push:/, "release.yml must react to main pushes");
  assert.match(text, /branches:\s*\[main\]/, "release.yml must react to main pushes");
  assert.match(
    text,
    /workflows\/test\.yml/,
    "release.yml must delegate verification to test.yml",
  );
});