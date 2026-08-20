import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  bump,
  chooseBump,
  parseLatestVersionTag,
  resolveReleaseVersion,
  shouldSkipRelease,
} from "../scripts/release.mjs";

const root = join(import.meta.dirname, "..");

// Builds a fake `npm` on PATH so tests can drive scripts/npm-publish.sh
// without touching the real registry. `npm view` and `npm publish` exit
// codes are controlled via env vars; a call to `npm publish` is recorded
// in a log file so tests can assert whether it ran.
function runPublishScript({
  viewExit = 0,
  publishExit = 0,
}: { viewExit?: number; publishExit?: number } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "npm-publish-test-"));
  const npmStub = join(dir, "npm");
  const logPath = join(dir, "publish.log");
  writeFileSync(
    npmStub,
    `#!/bin/sh
if [ "$1" = "view" ]; then
  exit ${viewExit}
elif [ "$1" = "publish" ]; then
  echo called >> "${logPath}"
  exit ${publishExit}
fi
exit 1
`,
  );
  chmodSync(npmStub, 0o755);
  try {
    const result = spawnSync("sh", ["scripts/npm-publish.sh"], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH ?? ""}`,
        NODE_AUTH_TOKEN: "test-token",
      },
    });
    return { ...result, publishCalled: existsSync(logPath) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("bump handles patch, minor, major, and explicit versions", () => {
  assert.equal(bump("0.18.0", "patch"), "0.18.1");
  assert.equal(bump("0.18.0", "minor"), "0.19.0");
  assert.equal(bump("0.18.0", "major"), "1.0.0");
  assert.equal(bump("0.18.0", "0.19.0"), "0.19.0");
});

test("chooseBump uses feat for minor and breaking for major", () => {
  assert.equal(chooseBump(["docs: roadmap", "fix: hooks timeout"]), "patch");
  assert.equal(
    chooseBump(["docs: catalog", "feat: wishcraft 0.19 — skills manager v2"]),
    "minor",
  );
  assert.equal(chooseBump(["feat(config): labels", "fix: debris"]), "minor");
  assert.equal(chooseBump(["feat!: drop old settings shape"]), "major");
  assert.equal(chooseBump(["fix: foo", "chore: release 0.18.0"]), "patch");
});

test("shouldSkipRelease guards release commits and opt-out", () => {
  assert.equal(shouldSkipRelease("chore: release 0.19.0"), true);
  assert.equal(shouldSkipRelease("docs: roadmap [skip release]"), true);
  assert.equal(shouldSkipRelease("feat: lantern welcome"), false);
});

test("resolveReleaseVersion maps auto from subjects onto the current version", () => {
  assert.deepEqual(
    resolveReleaseVersion("0.18.0", "auto", [
      "feat: wishcraft 0.19 — skills manager v2",
      "docs: drop leftover merge conflict marker from ROADMAP",
    ]),
    { kind: "minor", next: "0.19.0" },
  );
  assert.deepEqual(resolveReleaseVersion("0.19.0", "auto", ["docs: typo"]), {
    kind: "patch",
    next: "0.19.1",
  });
});

test("parseLatestVersionTag picks the highest vX.Y.Z tag", () => {
  assert.equal(parseLatestVersionTag([]), null);
  assert.equal(parseLatestVersionTag(["v0.9.0", "v0.18.0", "v0.10.0"]), "v0.18.0");
  assert.equal(parseLatestVersionTag(["upstream-v1", "v0.18.0"]), "v0.18.0");
});

test("npm-publish.sh fails closed without NODE_AUTH_TOKEN", () => {
  const env = { ...process.env };
  delete env.NODE_AUTH_TOKEN;
  delete env.NPM_TOKEN;
  const result = spawnSync("sh", ["scripts/npm-publish.sh"], {
    cwd: root,
    env,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /NPM_TOKEN is missing/);
});

test("npm-publish.sh fails closed when NODE_AUTH_TOKEN is set but empty", () => {
  const result = spawnSync("sh", ["scripts/npm-publish.sh"], {
    cwd: root,
    env: { ...process.env, NODE_AUTH_TOKEN: "" },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /NPM_TOKEN is missing/);
});

test("npm-publish.sh skips publish and still prints catalog URLs when the version is already on npm", () => {
  const result = runPublishScript({ viewExit: 0 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.publishCalled, false);
  assert.match(result.stdout, /is already on npm; skip publish/);
  assert.match(result.stdout, /npm: https:\/\/www\.npmjs\.com\/package\/@groeponline\/pi-wishcraft/);
  assert.match(result.stdout, /pi\.dev: https:\/\/pi\.dev\/packages\/@groeponline\/pi-wishcraft/);
  assert.match(result.stdout, /search: https:\/\/pi\.dev\/packages\?name=wishcraft/);
  assert.match(result.stdout, /groeponline: https:\/\/pi\.dev\/packages\?name=groeponline/);
});

test("npm-publish.sh publishes and prints catalog URLs when the version is not yet on npm", () => {
  const result = runPublishScript({ viewExit: 1, publishExit: 0 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.publishCalled, true);
  assert.doesNotMatch(result.stdout, /skip publish/);
  assert.match(result.stdout, /npm: https:\/\/www\.npmjs\.com\/package\/@groeponline\/pi-wishcraft/);
});

test("npm-publish.sh propagates npm publish failures and stops before printing catalog URLs", () => {
  const result = runPublishScript({ viewExit: 1, publishExit: 1 });
  assert.notEqual(result.status, 0);
  assert.equal(result.publishCalled, true);
  assert.doesNotMatch(result.stdout, /npm: https:\/\/www\.npmjs\.com/);
});

test("release --dry-run auto does not write package.json", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/release.mjs", "auto", "--dry-run"],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Would release \d+\.\d+\.\d+ \((patch|minor|major)\)/);
});
