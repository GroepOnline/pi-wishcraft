import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Three rules that GitHub Actions enforces at runtime and says nothing useful
 * about when you get them wrong. Each one broke a release:
 *
 * 1. `bun` must be installed before a job calls it. The bun migration (#128)
 *    rewrote `node scripts/...` to `bun scripts/...` in the publish job but left
 *    `bun-setup` below it, so v1.20.0's publish died with `bun: command not
 *    found` (exit 127) before it ever reached npm.
 * 2. `gh` must know which repository to talk to. The `verify` aggregator has no
 *    checkout, so every `gh workflow run` there died with
 *    `failed to run git: fatal: not a git repository` and no release candidate
 *    could be promoted until the step pinned `GH_REPO`.
 * 3. A third-party action must be pinned to a full commit SHA. The org policy
 *    rejects `actions/checkout@v7` at job setup, so every lane fails in 3
 *    seconds with `steps: 0` and reads like a broken test suite.
 *
 * Checked as text against every workflow: the shapes are small and stable, and
 * a parser would only hide the failure in its own edge cases.
 */

const REPO_ROOT = resolve(import.meta.dirname, "..");
const WORKFLOW_DIR = join(REPO_ROOT, ".github/workflows");
const ACTION_DIR = join(REPO_ROOT, ".github/actions");

function workflowFiles(): string[] {
  if (!existsSync(WORKFLOW_DIR)) return [];
  return readdirSync(WORKFLOW_DIR)
    .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
    .map((file) => join(WORKFLOW_DIR, file));
}

/** Composite actions carry the same `uses:` lines, so they are guarded too. */
function actionFiles(): string[] {
  if (!existsSync(ACTION_DIR)) return [];
  return readdirSync(ACTION_DIR).flatMap((dir) =>
    ["action.yml", "action.yaml"]
      .map((file) => join(ACTION_DIR, dir, file))
      .filter(existsSync),
  );
}

/** Split a workflow into its job blocks (job keys sit at two-space indent). */
function jobs(yaml: string): { name: string; body: string }[] {
  const jobsAt = yaml.indexOf("\njobs:");
  const body = jobsAt === -1 ? "" : yaml.slice(jobsAt);
  const starts = [...body.matchAll(/^ {2}([a-z][a-z0-9-]*):$/gm)];
  return starts.map((match, index) => ({
    name: match[1],
    body: body.slice(match.index ?? 0, starts[index + 1]?.index ?? body.length),
  }));
}

test("every job that runs bun installs it first", () => {
  const offenders: string[] = [];
  for (const file of workflowFiles()) {
    for (const job of jobs(readFileSync(file, "utf8"))) {
      const firstBunCall = job.body.search(/^\s+(?:run:\s*)?bun\s/m);
      if (firstBunCall === -1) continue;
      const setup = job.body.indexOf("uses: ./.github/actions/bun-setup");
      if (setup === -1 || setup > firstBunCall) offenders.push(`${file}:${job.name}`);
    }
  }
  assert.deepEqual(offenders, [], "jobs that call bun without bun-setup above the call");
});

test("every job that calls gh without a checkout pins GH_REPO", () => {
  const offenders: string[] = [];
  for (const file of workflowFiles()) {
    const yaml = readFileSync(file, "utf8");
    for (const job of jobs(yaml)) {
      if (/uses: actions\/checkout/.test(job.body)) continue;
      if (!/\bgh (?:api|workflow|run|release|pr)\b/.test(job.body)) continue;
      // Workflow-level `env:` satisfies it for every job in the file.
      if (!/GH_REPO:/.test(yaml)) offenders.push(`${file}:${job.name}`);
    }
  }
  assert.deepEqual(offenders, [], "jobs that call gh without a repository to talk to");
});

test("every third-party action is pinned to a full-length commit SHA", () => {
  const offenders: string[] = [];
  for (const file of [...workflowFiles(), ...actionFiles()]) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, index) => {
        const ref = /^\s*(?:-\s+)?uses:\s*(\S+)/.exec(line)?.[1];
        // `./` actions and reusable workflows are ours, not the marketplace.
        if (!ref || ref.startsWith("./")) return;
        if (!/@[0-9a-f]{40}$/.test(ref)) offenders.push(`${file}:${index + 1} ${ref}`);
      });
  }
  assert.deepEqual(offenders, [], "actions that are not pinned to a commit SHA");
});
