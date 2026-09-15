import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  BUILD_SHA_ENV,
  readProductIdentity,
} from "../src/product-identity.ts";
import {
  expectedTag,
  sourcesAgree,
  verifyTagEqualsVersion,
} from "../scripts/verify-release-tag.mjs";

const root = path.resolve(import.meta.dirname, "..");
const workflowsDir = path.join(root, ".github/workflows");
const workflow = readFileSync(path.join(workflowsDir, "release.yml"), "utf8");
const HOSTED_RUNNER = /^\s*runs-on:\s*.*(ubuntu-latest|macos-latest|windows-latest)/;

test("workflows do not use GitHub-hosted runners", () => {
  for (const name of readdirSync(workflowsDir)) {
    if (!name.endsWith(".yml")) continue;
    const text = readFileSync(path.join(workflowsDir, name), "utf8");
    for (const line of text.split("\n")) {
      assert.doesNotMatch(line, HOSTED_RUNNER, `${name}: ${line}`);
    }
  }
});

test("workflow verifies tag equals version and attaches SHA256SUMS without changing npm publish", () => {
  assert.match(workflow, /tags:\s*\n\s+-\s*["']v\*/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /tag:/);
  assert.match(workflow, /verify-release-tag\.mjs --tag/);
  assert.match(workflow, /origin\/main/);
  assert.match(workflow, /npm pack --ignore-scripts/);
  assert.match(workflow, /sha256sum .* > SHA256SUMS/);
  assert.match(workflow, /SHA256SUMS/);
  assert.match(workflow, /gh release upload/);
  assert.match(workflow, /PI_WISHCRAFT_BUILD_SHA/);
  assert.match(workflow, /run: sh scripts\/npm-publish\.sh/);
  assert.match(workflow, /NODE_AUTH_TOKEN: \$\{\{ secrets\.NPM_TOKEN \}\}/);
  const publishJob = workflow.slice(workflow.indexOf("name: test + publish"));
  const backfillJob = workflow.slice(workflow.indexOf("name: Backfill GitHub Release evidence"));
  assert.match(publishJob, /run: sh scripts\/npm-publish\.sh/);
  assert.doesNotMatch(backfillJob, /npm-publish\.sh|NODE_AUTH_TOKEN/);
});

test("package.json version is stable X.Y.Z and maps to vX.Y.Z", () => {
  const version = sourcesAgree();
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.equal(expectedTag(version), `v${version}`);
  assert.deepEqual(verifyTagEqualsVersion(`v${version}`), { tag: `v${version}`, version });
  assert.throws(() => verifyTagEqualsVersion("v0.0.0"), /does not equal version source/);
});

test("product-identity --version reads the manifest and omits an unknown SHA", () => {
  const env = { ...process.env };
  delete env[BUILD_SHA_ENV];
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "src/product-identity.ts", "--version"],
    { cwd: root, encoding: "utf8", env },
  );
  assert.equal(result.status, 0, result.stderr);
  const identity = JSON.parse(result.stdout);
  assert.equal(identity.version, sourcesAgree());
  assert.equal(identity.source_sha, null);
});

test("product identity accepts a release SHA and rejects an invented default", () => {
  const sha = "0123456789abcdef0123456789abcdef01234567";
  const identity = readProductIdentity({ [BUILD_SHA_ENV]: sha });
  assert.equal(identity.version, sourcesAgree());
  assert.equal(identity.source_sha, sha);
  assert.throws(() => readProductIdentity({ [BUILD_SHA_ENV]: "unknown" }), /40-character/);
});
