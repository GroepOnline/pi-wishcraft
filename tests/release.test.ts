import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
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

test("npm-publish.sh fails closed without NODE_AUTH_TOKEN", () => {
  const root = join(import.meta.dirname, "..");
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
  const root = join(import.meta.dirname, "..");
  const env = { ...process.env, NODE_AUTH_TOKEN: "" };
  delete env.NPM_TOKEN;
  const result = spawnSync("sh", ["scripts/npm-publish.sh"], {
    cwd: root,
    env,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /NPM_TOKEN is missing/);
});

// The remaining npm-publish.sh tests stub out `npm` with a fake executable
// placed first on PATH, so no real registry traffic happens. The fake
// records every invocation to FAKE_NPM_LOG and reports exit codes from
// FAKE_NPM_VIEW_EXIT / FAKE_NPM_PUBLISH_EXIT so each test can drive a
// specific scenario (version published already, version missing, publish
// failure) without touching the network.
function withFakeNpm<T>(run: (npmDir: string, logFile: string, publishMarker: string) => T): T {
  const npmDir = mkdtempSync(join(tmpdir(), "fake-npm-"));
  const logFile = join(npmDir, "npm.log");
  const publishMarker = join(npmDir, "published.marker");
  const npmPath = join(npmDir, "npm");
  writeFileSync(
    npmPath,
    [
      "#!/bin/sh",
      'case "$1" in',
      "  view)",
      '    echo "$@" >> "$FAKE_NPM_LOG"',
      '    exit "${FAKE_NPM_VIEW_EXIT:-0}"',
      "    ;;",
      "  publish)",
      '    echo "$@" >> "$FAKE_NPM_LOG"',
      '    touch "$FAKE_NPM_PUBLISH_MARKER"',
      '    exit "${FAKE_NPM_PUBLISH_EXIT:-0}"',
      "    ;;",
      "  *)",
      "    exit 1",
      "    ;;",
      "esac",
      "",
    ].join("\n"),
  );
  chmodSync(npmPath, 0o755);
  try {
    return run(npmDir, logFile, publishMarker);
  } finally {
    rmSync(npmDir, { recursive: true, force: true });
  }
}

function runNpmPublishScript(
  npmDir: string,
  env: Record<string, string | undefined>,
) {
  const root = join(import.meta.dirname, "..");
  return spawnSync("sh", ["scripts/npm-publish.sh"], {
    cwd: root,
    env: {
      ...process.env,
      PATH: `${npmDir}:${process.env.PATH}`,
      NODE_AUTH_TOKEN: "test-token",
      ...env,
    },
    encoding: "utf8",
  });
}

test("npm-publish.sh skips publish when the version is already on npm", () => {
  withFakeNpm((npmDir, logFile, publishMarker) => {
    const result = runNpmPublishScript(npmDir, {
      FAKE_NPM_LOG: logFile,
      FAKE_NPM_PUBLISH_MARKER: publishMarker,
      FAKE_NPM_VIEW_EXIT: "0",
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /is already on npm; skip publish/);
    assert.match(
      result.stdout,
      /npm: https:\/\/www\.npmjs\.com\/package\/@groeponline\/pi-wishcraft/,
    );
    assert.match(
      result.stdout,
      /pi\.dev: https:\/\/pi\.dev\/packages\/@groeponline\/pi-wishcraft/,
    );
    assert.match(result.stdout, /search: https:\/\/pi\.dev\/packages\?name=wishcraft/);
    assert.match(
      result.stdout,
      /groeponline: https:\/\/pi\.dev\/packages\?name=groeponline/,
    );
    assert.throws(() => readFileSync(publishMarker));
    assert.doesNotMatch(readFileSync(logFile, "utf8"), /publish --access public/);
  });
});

test("npm-publish.sh publishes when the version is not on npm", () => {
  withFakeNpm((npmDir, logFile, publishMarker) => {
    const result = runNpmPublishScript(npmDir, {
      FAKE_NPM_LOG: logFile,
      FAKE_NPM_PUBLISH_MARKER: publishMarker,
      FAKE_NPM_VIEW_EXIT: "1",
      FAKE_NPM_PUBLISH_EXIT: "0",
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.doesNotMatch(result.stdout, /skip publish/);
    assert.match(
      result.stdout,
      /npm: https:\/\/www\.npmjs\.com\/package\/@groeponline\/pi-wishcraft/,
    );
    assert.doesNotThrow(() => readFileSync(publishMarker));
    assert.match(readFileSync(logFile, "utf8"), /publish --access public/);
  });
});

test("npm-publish.sh checks the registry using the current package.json name and version", () => {
  withFakeNpm((npmDir, logFile) => {
    const root = join(import.meta.dirname, "..");
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const result = runNpmPublishScript(npmDir, {
      FAKE_NPM_LOG: logFile,
      FAKE_NPM_VIEW_EXIT: "0",
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const escapedVersion = pkg.version.replace(/\./g, "\\.");
    assert.match(
      readFileSync(logFile, "utf8"),
      new RegExp(`view @groeponline/pi-wishcraft@${escapedVersion} version`),
    );
  });
});

test("npm-publish.sh exits non-zero and skips the catalog output when npm publish fails", () => {
  withFakeNpm((npmDir, logFile, publishMarker) => {
    const result = runNpmPublishScript(npmDir, {
      FAKE_NPM_LOG: logFile,
      FAKE_NPM_PUBLISH_MARKER: publishMarker,
      FAKE_NPM_VIEW_EXIT: "1",
      FAKE_NPM_PUBLISH_EXIT: "1",
    });
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout, /npmjs\.com/);
  });
});

test("release.yml publishes from the bump job after cutting the release tag", () => {
  const root = join(import.meta.dirname, "..");
  const workflow = readFileSync(
    join(root, ".github/workflows/release.yml"),
    "utf8",
  );
  const bumpJob = workflow.slice(
    workflow.indexOf("\n  bump:"),
    workflow.indexOf("\n  publish:"),
  );
  assert.match(bumpJob, /name: bump \+ tag \+ publish/);
  assert.match(bumpJob, /id-token: write/);
  assert.match(bumpJob, /run: sh scripts\/npm-publish\.sh/);
  assert.match(bumpJob, /NODE_AUTH_TOKEN: \$\{\{ secrets\.NPM_TOKEN \}\}/);
  const cutTagIndex = bumpJob.indexOf("Cut release tag");
  const publishIndex = bumpJob.indexOf("Publish to npm");
  assert.ok(cutTagIndex > -1, "expected a 'Cut release tag' step");
  assert.ok(publishIndex > -1, "expected a 'Publish to npm' step");
  assert.ok(
    cutTagIndex < publishIndex,
    "the release tag must be cut before publishing",
  );
});

test("release.yml still publishes via npm-publish.sh on a manual v* tag push", () => {
  const root = join(import.meta.dirname, "..");
  const workflow = readFileSync(
    join(root, ".github/workflows/release.yml"),
    "utf8",
  );
  const publishJob = workflow.slice(workflow.indexOf("\n  publish:"));
  assert.match(publishJob, /if: startsWith\(github\.ref, 'refs\/tags\/v'\)/);
  assert.match(publishJob, /run: sh scripts\/npm-publish\.sh/);
  assert.doesNotMatch(publishJob, /npm view/);
  assert.doesNotMatch(publishJob, /Catalog URLs/);
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
