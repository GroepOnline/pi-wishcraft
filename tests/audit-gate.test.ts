import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The dependency audit gate.
 *
 * `npm audit --audit-level=high` used to sit in CI behind
 * `continue-on-error: true`, labelled "informational". It exits 1 today (the
 * peer-shrinkwrapped `brace-expansion`), so it could never be made blocking
 * without also failing every release forever. Being permanently ignorable, it
 * ignored new findings too — the same failure shape as the coverage gate that
 * printed thresholds while collecting no coverage.
 *
 * `scripts/audit-gate.mjs` replaces it: new high/critical advisories fail, the
 * one justified inherited advisory is tolerated, and a baseline entry that
 * stops reporting fails so it cannot become a permanent blanket exemption.
 *
 * These tests drive the script against synthetic baselines rather than against
 * the live registry, so they assert the decision logic offline. The one test
 * that shells out to `npm audit` is the live end-to-end check.
 */

const root = join(import.meta.dirname, "..");
const script = join(root, "scripts", "audit-gate.mjs");

function runGate(baseline: unknown) {
  const dir = mkdtempSync(join(tmpdir(), "audit-gate-"));
  try {
    const file = join(dir, "baseline.json");
    writeFileSync(file, JSON.stringify(baseline, null, 2));
    const result = spawnSync(process.execPath, [script, file], {
      cwd: root,
      encoding: "utf8",
    });
    return {
      status: result.status,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The real baseline, so the synthetic cases stay anchored to reality. */
function realBaseline() {
  return JSON.parse(readFileSync(join(root, "audit-baseline.json"), "utf8"));
}

test("the committed baseline is valid and every entry is justified", () => {
  const baseline = realBaseline();
  assert.ok(Array.isArray(baseline.accepted), "baseline.accepted must be an array");
  for (const entry of baseline.accepted) {
    assert.ok(entry.name, "every accepted advisory needs a name");
    assert.match(
      entry.id,
      /^GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}$/i,
      `${entry.name}: every accepted entry needs its advisory id, so a new advisory on the same package cannot ride in under the old entry`,
    );
    assert.ok(
      typeof entry.reason === "string" && entry.reason.trim().length > 40,
      `${entry.name} needs a real justification; "inherited" on its own is what this baseline exists to prevent`,
    );
    // A reason has to say *why* it is unreachable, or it is just an assertion.
    assert.match(
      entry.reason,
      /shrinkwrap|overrides|not reachable|upstream/i,
      `${entry.name}: the reason should state the mechanism that makes it unreachable`,
    );
  }
});

/**
 * Drive the gate against a stubbed `npm` that emits `json` as its audit
 * answer, so advisory-level matching and error handling are testable offline.
 */
function runGateWithAudit(baseline: unknown, auditJson: unknown) {
  const dir = mkdtempSync(join(tmpdir(), "audit-gate-"));
  try {
    const file = join(dir, "baseline.json");
    writeFileSync(file, JSON.stringify(baseline, null, 2));
    const stub = join(dir, "npm");
    writeFileSync(stub, `#!/bin/sh
cat '${join(dir, "audit.json")}'\n`);
    writeFileSync(join(dir, "audit.json"), JSON.stringify(auditJson));
    chmodSync(stub, 0o755);
    const result = spawnSync(process.execPath, [script, file], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
    });
    return {
      status: result.status,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A blocking vuln entry the way `npm audit --json` reports it. */
function auditWith(...via: Array<Record<string, unknown>>) {
  return {
    vulnerabilities: {
      "brace-expansion": {
        name: "brace-expansion",
        severity: "high",
        range: "4.0.0 - 5.0.11",
        via,
        nodes: ["node_modules/@earendil-works/pi-coding-agent"],
      },
    },
  };
}

function advisory(id: string, severity = "high", range = ">=4.0.0 <5.0.11") {
  return {
    source: 1240107,
    name: "brace-expansion",
    title: `synthetic advisory ${id}`,
    url: `https://github.com/advisories/${id}`,
    severity,
    range,
  };
}

test("the gate exits 2 when the baseline is missing", () => {
  const result = spawnSync(process.execPath, [script, join(root, "no-such-baseline.json")], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /baseline not found/);
});

test("the gate exits 2 when the baseline is unparseable", () => {
  const dir = mkdtempSync(join(tmpdir(), "audit-gate-"));
  try {
    const file = join(dir, "baseline.json");
    writeFileSync(file, "{ not json");
    const result = spawnSync(process.execPath, [script, file], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /cannot parse/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the gate fails a baseline entry with no written reason", () => {
  const baseline = realBaseline();
  baseline.accepted = [{ name: "brace-expansion", reason: "" }];
  const result = runGate(baseline);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /needs a written reason/);
});

test("the gate fails when a baselined advisory no longer reports", () => {
  // A stale entry is a permanent blanket exemption, so it must be removed.
  const baseline = realBaseline();
  baseline.accepted.push({
    name: "definitely-not-installed-xyz",
    id: "GHSA-0000-0000-0000",
    reason: "left over from an older tree",
  });
  const result = runGate(baseline);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no longer reports/);
});

test("the gate exits 2 when npm audit answers with an error envelope", () => {
  // An audit that failed to run (registry down, config error) must never be
  // read as "zero findings": with a trimmed baseline that would be a green
  // gate over an audit that never executed.
  const result = runGateWithAudit(realBaseline(), {
    error: {
      code: "EALLOWSCRIPTS",
      summary: "--allow-scripts is not allowed in project-scoped installs.",
      detail: "",
    },
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /npm audit failed to run/);
  assert.match(result.stderr, /allow-scripts/);
});

test("a new high advisory on an already-accepted package fails the gate", () => {
  // The baseline tolerates two specific advisories by id. A third one for the
  // same package must be named as new, not swallowed by the package match.
  const result = runGateWithAudit(
    realBaseline(),
    auditWith(
      advisory("GHSA-qhr7-859c-m2p7", "high", ">=4.0.0 <5.0.11"),
      advisory("GHSA-6j4f-fj2g-mc7p", "high", ">=4.0.0 <5.0.10"),
      advisory("GHSA-zzzz-zzzz-zzzz", "high", ">=5.0.0 <5.0.99"),
    ),
  );
  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(result.stderr, /new high advisory/);
  assert.match(result.stderr, /GHSA-zzzz-zzzz-zzzz/);
});

test("the accepted advisories pass by id even when the package is rejected by name", () => {
  // Sanity for the matching direction: exactly the baselined ids, nothing
  // else, is a clean pass through the advisory-level path.
  const baseline = realBaseline();
  baseline.accepted = baseline.accepted.filter(
    (e: { name: string }) => e.name === "brace-expansion",
  );
  const result = runGateWithAudit(
    baseline,
    auditWith(
      advisory("GHSA-qhr7-859c-m2p7", "high", ">=4.0.0 <5.0.11"),
      advisory("GHSA-6j4f-fj2g-mc7p", "high", ">=4.0.0 <5.0.10"),
    ),
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /audit gate OK/);
});

test("a moderate advisory inside a blocking aggregate is not itself blocking", () => {
  // The live tree is exactly this shape: two highs plus GHSA-q2hr-2g5m-vwhr
  // (moderate, fixed at 5.0.12) riding inside the aggregate. The gate blocks
  // on high/critical advisories only.
  const result = runGateWithAudit(
    realBaseline(),
    auditWith(
      advisory("GHSA-qhr7-859c-m2p7", "high", ">=4.0.0 <5.0.11"),
      advisory("GHSA-6j4f-fj2g-mc7p", "high", ">=4.0.0 <5.0.10"),
      advisory("GHSA-q2hr-2g5m-vwhr", "moderate", ">=4.0.0 <5.0.12"),
    ),
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("the live gate passes against the real tree", () => {
  // End-to-end: the only blocking finding is the baselined inherited one.
  const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /audit gate OK/);
});

test("CI runs the audit gate instead of ignoring the audit", () => {
  const workflow = readFileSync(join(root, ".github/workflows/test.yml"), "utf8");

  // Find the audit step itself rather than grepping the whole file, so a
  // `continue-on-error` on some *other* step cannot be mistaken for this one.
  const lines = workflow.split("\n");
  const stepStart = lines.findIndex((l) => /^\s*-\s*name:.*audit/i.test(l));
  assert.notEqual(stepStart, -1, "test.yml must have an audit step");

  const nextStep = lines.findIndex(
    (l, i) => i > stepStart && /^\s*-\s*(name|uses|run):/.test(l),
  );
  const step = lines.slice(stepStart, nextStep === -1 ? undefined : nextStep).join("\n");

  assert.match(
    step,
    /run:\s*npm run audit/,
    "the audit step must invoke the gate, not a raw `npm audit`",
  );
  // The exact shape that made this gate decorative: an audit that can never
  // fail the run also cannot fail on anything new.
  assert.doesNotMatch(
    step,
    /continue-on-error:\s*true/,
    "the audit step is marked continue-on-error, so a new advisory would pass CI",
  );
});

test("package.json exposes the audit script", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(pkg.scripts.audit, "node scripts/audit-gate.mjs");
});

test("the baseline is a repo-only artifact and stays out of the tarball", () => {
  // `files` contains a `*.json` glob, so adding a root-level JSON file silently
  // ships it. The reason strings describe our dependency posture, which is not
  // something every consumer should receive -- and a stale copy in a published
  // tarball is a second source of truth nobody updates.
  assert.ok(existsSync(join(root, "audit-baseline.json")), "baseline must exist");

  const result = spawnSync("npm", ["pack", "--dry-run", "--ignore-scripts", "--json"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert.equal(result.status, 0, result.stderr);
  const packed = JSON.parse(result.stdout)[0] as { files: Array<{ path: string }> };
  const leaked = packed.files
    .map((f) => f.path)
    .filter((p) => p === "audit-baseline.json" || p.endsWith("/audit-baseline.json"));
  assert.deepEqual(
    leaked,
    [],
    "audit-baseline.json must not be published -- exclude it in package.json files[]",
  );
});