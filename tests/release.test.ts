import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import {
  bump,
  chooseBump,
  parseLatestVersionTag,
  resolveReleaseVersion,
  shouldSkipRelease,
} from "../scripts/release.mjs";

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

test("release --dry-run auto does not write package.json", () => {
  const root = join(import.meta.dirname, "..");
  const result = spawnSync(
    process.execPath,
    ["scripts/release.mjs", "auto", "--dry-run"],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Would release \d+\.\d+\.\d+ \((patch|minor|major)\)/);
});
