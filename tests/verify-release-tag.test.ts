import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  expectedTag,
  parseReleaseArgs,
  readPackageVersion,
  sourcesAgree,
  verifyTagEqualsVersion,
  versionSources,
} from "../scripts/verify-release-tag.mjs";

function withPackage(pkg: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "wishcraft-tag-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg));
  return dir;
}

test("verify-release-tag: readPackageVersion reads and trims the package version", () => {
  const dir = withPackage({ name: "x", version: " 1.13.0\n" });
  try {
    assert.equal(readPackageVersion(dir), "1.13.0");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("verify-release-tag: missing or empty version fails loudly", () => {
  const empty = withPackage({ name: "x", version: "" });
  const absent = mkdtempSync(join(tmpdir(), "wishcraft-tag-"));
  try {
    assert.throws(() => readPackageVersion(empty), /version is missing/);
    assert.throws(() => readPackageVersion(absent), /ENOENT/);
  } finally {
    rmSync(empty, { recursive: true, force: true });
    rmSync(absent, { recursive: true, force: true });
  }
});

test("verify-release-tag: expectedTag pairs with the version", () => {
  assert.equal(expectedTag("1.13.0"), "v1.13.0");
});

test("verify-release-tag: sourcesAgree enforces stable X.Y.Z", () => {
  assert.equal(sourcesAgree({ packageVersion: "1.13.0" }), "1.13.0");
  assert.throws(() => sourcesAgree({ packageVersion: "1.13" }), /not stable X\.Y\.Z/);
  assert.throws(() => sourcesAgree({ packageVersion: "v1.13.0" }), /not stable X\.Y\.Z/);
});

test("verify-release-tag: verifyTagEqualsVersion accepts the match and rejects drift", () => {
  const sources = { packageVersion: "1.13.0" };
  assert.deepEqual(verifyTagEqualsVersion("v1.13.0", sources), {
    tag: "v1.13.0",
    version: "1.13.0",
  });
  assert.throws(
    () => verifyTagEqualsVersion("v1.14.0", sources),
    /does not equal version source tag v1\.13\.0/,
  );
});

test("verify-release-tag: versionSources reads from a real directory", () => {
  const dir = withPackage({ version: "2.0.0" });
  try {
    assert.deepEqual(versionSources(dir), { packageVersion: "2.0.0" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("verify-release-tag: parseReleaseArgs parses flags and rejects misuse", () => {
  assert.deepEqual(parseReleaseArgs(["--tag", "v1.0.0", "--sha", "abc"]), {
    tag: "v1.0.0",
    sha: "abc",
    mainRef: "origin/main",
  });
  assert.deepEqual(parseReleaseArgs(["--main-ref", "refs/heads/main"]), {
    tag: null,
    sha: null,
    mainRef: "refs/heads/main",
  });
  assert.throws(() => parseReleaseArgs(["--unknown"]), /unknown argument/);
  assert.throws(() => parseReleaseArgs(["--tag", "--sha", "abc"]), /missing value for --tag/);
  assert.throws(() => parseReleaseArgs(["--sha"]), /missing value for --sha/);
});
