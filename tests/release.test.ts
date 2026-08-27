import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
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
  existingTagAction,
  extractChangelogNotes,
  parseLatestVersionTag,
  parseReleaseCandidateBranch,
  resolveReleaseVersion,
  rewritePackageLockVersion,
  rewriteUnreleasedHeading,
  shouldSkipRelease,
  validateReleaseCandidateMetadata,
} from "../scripts/release.mjs";

const root = join(import.meta.dirname, "..");
const pkgVersion = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
).version as string;

// A stub `npm` that never touches the network. Behavior is driven by env
// vars so a single stub script works for every scenario below:
//   STUB_NPM_VIEW_EXIT    - exit code for `npm view` (0 = "already published")
//   STUB_NPM_PUBLISH_EXIT - exit code for `npm publish`
//   STUB_NPM_PUBLISH_MARKER - file path touched when `npm publish` runs
const STUB_NPM = `#!/bin/sh
case "$1" in
  view)
    if [ "\${STUB_NPM_VIEW_EXIT:-0}" -eq 0 ]; then
      echo "1.2.3"
      exit 0
    fi
    if [ "\${STUB_NPM_VIEW_KIND:-404}" = "404" ]; then
      echo "npm error code E404" >&2
      echo "npm error 404 Not Found - GET https://registry.npmjs.org/missing" >&2
      exit 1
    fi
    echo "npm error code E500" >&2
    echo "network timeout" >&2
    exit 1
    ;;
  publish)
    if [ -n "\${STUB_NPM_PUBLISH_MARKER:-}" ]; then
      : > "$STUB_NPM_PUBLISH_MARKER"
    fi
    if [ -n "\${STUB_NPM_PUBLISH_ERR:-}" ]; then
      printf '%s\n' "$STUB_NPM_PUBLISH_ERR" >&2
    fi
    exit "\${STUB_NPM_PUBLISH_EXIT:-0}"
    ;;
  *)
    exit 1
    ;;
esac
`;

function withStubNpmProject(pkgVersion: string) {
  const projectDir = mkdtempSync(join(tmpdir(), "pi-wishcraft-npm-publish-"));
  const binDir = mkdtempSync(join(tmpdir(), "pi-wishcraft-npm-publish-bin-"));
  writeFileSync(
    join(projectDir, "package.json"),
    JSON.stringify({
      name: "@groeponline/pi-wishcraft",
      version: pkgVersion,
    }),
  );
  const npmStubPath = join(binDir, "npm");
  writeFileSync(npmStubPath, STUB_NPM);
  chmodSync(npmStubPath, 0o755);
  return {
    projectDir,
    binDir,
    cleanup() {
      rmSync(projectDir, { recursive: true, force: true });
      rmSync(binDir, { recursive: true, force: true });
    },
  };
}

function runNpmPublishScript(
  projectDir: string,
  binDir: string,
  extraEnv: Record<string, string | undefined> = {},
) {
  return spawnSync("sh", [join(root, "scripts/npm-publish.sh")], {
    cwd: projectDir,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
      NODE_AUTH_TOKEN: "fake-token-for-tests",
      ...extraEnv,
    },
  });
}

test("bump handles patch, minor, major, and explicit versions", () => {
  assert.equal(bump("0.18.0", "patch"), "0.18.1");
  assert.equal(bump("0.18.0", "minor"), "0.19.0");
  assert.equal(bump("0.18.0", "major"), "1.0.0");
  assert.equal(bump("0.18.0", "0.19.0"), "0.19.0");
});

test("rewritePackageLockVersion keeps root and package metadata in sync", () => {
  const lock = JSON.stringify({
    name: "@groeponline/pi-wishcraft",
    version: "1.3.0",
    packages: { "": { name: "@groeponline/pi-wishcraft", version: "1.3.0" } },
  });
  const rewritten = JSON.parse(rewritePackageLockVersion(lock, "1.3.1"));
  assert.equal(rewritten.version, "1.3.1");
  assert.equal(rewritten.packages[""].version, "1.3.1");
});

test("release candidate metadata binds version, parent and release-only files", () => {
  const parentSha = "0123456789abcdef0123456789abcdef01234567";
  assert.deepEqual(
    parseReleaseCandidateBranch("release-candidate/v1.3.1-0123456789ab"),
    { version: "1.3.1", parentPrefix: "0123456789ab" },
  );
  assert.equal(
    validateReleaseCandidateMetadata({
      branch: "release-candidate/v1.3.1-0123456789ab",
      subject: "chore: release 1.3.1",
      packageVersion: "1.3.1",
      changedFiles: ["package.json", "CHANGELOG.md", "package-lock.json"],
      changelog: "# Changelog\n\n## [Unreleased]\n\n## [1.3.1] - 2026-08-25\n",
      parentSha,
    }),
    "1.3.1",
  );
  assert.throws(() =>
    validateReleaseCandidateMetadata({
      branch: "release-candidate/v1.3.1-0123456789ab",
      subject: "chore: release 1.3.1",
      packageVersion: "1.3.1",
      changedFiles: ["package.json", "src/index.ts", "CHANGELOG.md", "package-lock.json"],
      changelog: "## [1.3.1] - 2026-08-25",
      parentSha,
    }),
  /Unexpected release candidate files/);
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

test("existingTagAction fails closed on a colliding next tag unless this tree is already that release", () => {
  assert.equal(existingTagAction("0.19.0", "0.19.1", false), "cut");
  assert.equal(existingTagAction("0.19.1", "0.19.1", true), "already-cut");
  assert.equal(existingTagAction("0.19.0", "0.19.1", true), "collision");
});

test("rewriteUnreleasedHeading keeps an empty Unreleased section above the new version", () => {
  const rolled = rewriteUnreleasedHeading(
    "# Changelog\n\n## [Unreleased]\n\n### Added\n- Tab complete\n",
    "0.19.2",
    "2026-08-20",
  );
  assert.equal(rolled.rewritten, true);
  assert.equal(
    rolled.changelog,
    "# Changelog\n\n## [Unreleased]\n\n## [0.19.2] - 2026-08-20\n\n### Added\n- Tab complete\n",
  );
  const missing = rewriteUnreleasedHeading("# Changelog\n", "0.19.2", "2026-08-20");
  assert.equal(missing.rewritten, false);
  assert.equal(missing.changelog, "# Changelog\n");
  const prose = rewriteUnreleasedHeading(
    "# Changelog\n\nSee ## [Unreleased] in the docs.\n\n### [Unreleased]\n",
    "0.19.2",
    "2026-08-20",
  );
  assert.equal(prose.rewritten, false);
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

test("npm-publish.sh skips publish and prints the skip message when the version is already on npm", () => {
  const { projectDir, binDir, cleanup } = withStubNpmProject("1.2.3");
  try {
    const marker = join(binDir, "publish-called");
    const result = runNpmPublishScript(projectDir, binDir, {
      STUB_NPM_VIEW_EXIT: "0",
      STUB_NPM_PUBLISH_MARKER: marker,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /1\.2\.3 is already on npm; skip publish/);
    assert.equal(existsSync(marker), false, "npm publish should not run");
  } finally {
    cleanup();
  }
});

test("npm-publish.sh publishes when the version is not yet on npm", () => {
  const { projectDir, binDir, cleanup } = withStubNpmProject("4.5.6");
  try {
    const marker = join(binDir, "publish-called");
    const result = runNpmPublishScript(projectDir, binDir, {
      STUB_NPM_VIEW_EXIT: "1",
      STUB_NPM_PUBLISH_MARKER: marker,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.doesNotMatch(result.stdout, /already on npm/);
    assert.equal(existsSync(marker), true, "npm publish should run");
  } finally {
    cleanup();
  }
});

test("npm-publish.sh echoes the Pi catalog URLs after a successful skip or publish", () => {
  const { projectDir, binDir, cleanup } = withStubNpmProject("7.0.0");
  try {
    const result = runNpmPublishScript(projectDir, binDir, {
      STUB_NPM_VIEW_EXIT: "0",
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /npm: https:\/\/www\.npmjs\.com\/package\/@groeponline\/pi-wishcraft/);
    assert.match(result.stdout, /pi\.dev: https:\/\/pi\.dev\/packages\/@groeponline\/pi-wishcraft/);
    assert.match(result.stdout, /search: https:\/\/pi\.dev\/packages\?name=wishcraft/);
    assert.match(result.stdout, /groeponline: https:\/\/pi\.dev\/packages\?name=groeponline/);
  } finally {
    cleanup();
  }
});

test("npm-publish.sh fails closed when npm view errors for any reason other than not-found", () => {
  const { projectDir, binDir, cleanup } = withStubNpmProject("9.9.9");
  try {
    const marker = join(binDir, "publish-called");
    const result = runNpmPublishScript(projectDir, binDir, {
      STUB_NPM_VIEW_EXIT: "1",
      STUB_NPM_VIEW_KIND: "error",
      STUB_NPM_PUBLISH_MARKER: marker,
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /not publishing/);
    assert.equal(existsSync(marker), false, "npm publish should not run");
  } finally {
    cleanup();
  }
});

test("npm-publish.sh treats cannot-publish-over-existing as a successful skip", () => {
  const { projectDir, binDir, cleanup } = withStubNpmProject("3.3.3");
  try {
    const result = runNpmPublishScript(projectDir, binDir, {
      STUB_NPM_VIEW_EXIT: "1",
      STUB_NPM_PUBLISH_EXIT: "1",
      STUB_NPM_PUBLISH_ERR:
        "You cannot publish over the previously published versions",
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /3\.3\.3 is already on npm; skip publish/);
    assert.match(result.stdout, /npm: https:\/\/www\.npmjs\.com\/package\/@groeponline\/pi-wishcraft/);
  } finally {
    cleanup();
  }
});

test("npm-publish.sh fails and skips the catalog URLs when npm publish fails", () => {
  const { projectDir, binDir, cleanup } = withStubNpmProject("8.0.0");
  try {
    const result = runNpmPublishScript(projectDir, binDir, {
      STUB_NPM_VIEW_EXIT: "1",
      STUB_NPM_PUBLISH_EXIT: "1",
      STUB_NPM_PUBLISH_ERR: "EPERM forbidden",
    });
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout, /npm: https:\/\/www\.npmjs\.com/);
  } finally {
    cleanup();
  }
});

test("npm-publish.sh reads the package name from package.json", () => {
  const { projectDir, binDir, cleanup } = withStubNpmProject("1.0.0");
  try {
    writeFileSync(
      join(projectDir, "package.json"),
      JSON.stringify({ name: "@tmp/widget", version: "1.0.0" }),
    );
    const result = runNpmPublishScript(projectDir, binDir, {
      STUB_NPM_VIEW_EXIT: "0",
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /npm: https:\/\/www\.npmjs\.com\/package\/@tmp\/widget/);
    assert.doesNotMatch(result.stdout, /@groeponline\/pi-wishcraft/);
  } finally {
    cleanup();
  }
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

test(".github/workflows/release.yml publishes only from a verified tag", () => {
  const workflow = readFileSync(join(root, ".github/workflows/release.yml"), "utf8");
  const publishSteps = workflow.match(/run: sh scripts\/npm-publish\.sh/g) ?? [];
  assert.equal(publishSteps.length, 1, "candidate preparation must never publish");
  assert.match(workflow, /NODE_AUTH_TOKEN: \$\{\{ secrets\.NPM_TOKEN \}\}/);
  assert.doesNotMatch(workflow, /node scripts\/release\.mjs auto --push/);
});

test("release candidate preparation dispatches Verify on an immutable candidate ref", () => {
  const workflow = readFileSync(join(root, ".github/workflows/release.yml"), "utf8");
  assert.match(workflow, /actions: write/);
  assert.match(workflow, /VERSION="\$\(node scripts\/release\.mjs next auto\)"/);
  assert.match(workflow, /release-candidate\/v\$\{VERSION\}-\$\{BASE_SHORT\}/);
  assert.match(workflow, /candidate-check "\$BRANCH" "\$CANDIDATE_SHA" "\$GITHUB_SHA"/);
  assert.match(workflow, /actions\/workflows\/test\.yml\/dispatches/);
});

test("release promotion is checkout-free and validates GitHub metadata at the privileged boundary", () => {
  const promote = readFileSync(
    join(root, ".github/workflows/promote-release-candidate.yml"),
    "utf8",
  );
  // workflow_run is suppressed when the completed workflow was dispatched via
  // GITHUB_TOKEN (anti-recursion), so promotion must be an explicit
  // workflow_dispatch; the gate lives in Verify's dispatch step and the full
  // validation lives in Promotion's metadata-only step.
  assert.match(promote, /workflow_dispatch:/);
  assert.match(promote, /inputs:/);
  assert.match(promote, /branch:/);
  assert.match(promote, /sha:/);
  assert.doesNotMatch(promote, /actions\/checkout/);
  assert.match(promote, /repos\/\$GITHUB_REPOSITORY\/commits\/\$CANDIDATE_SHA/);
  assert.match(promote, /EXPECTED_FILES=.*CHANGELOG\.md package-lock\.json package\.json/);
  assert.match(promote, /git\/refs\/heads\/main/);
  assert.match(promote, /git\/refs.*refs\/tags\/\$TAG/);
  // gh api prints the error body to stdout on non-2xx, so ref and tag
  // existence must be gated on the exit code, never on an empty capture.
  assert.match(promote, /never on an empty capture/);
  assert.doesNotMatch(promote, /REMOTE_SHA="\$\(gh api[^)]*\) \|\| true/);
  assert.doesNotMatch(promote, /TAG_JSON="\$\(gh api[^)]*\) \|\| true/);

  // Verify may dispatch promotion only for bot-verified release candidates.
  const verify = readFileSync(join(root, ".github/workflows/test.yml"), "utf8");
  assert.match(verify, /gh workflow run promote-release-candidate\.yml --ref main/);
  assert.match(verify, /github\.actor == 'github-actions\[bot\]'/);
  assert.match(verify, /startsWith\(github\.ref_name, 'release-candidate\/v'\)/);
});

test("release workflows keep npm auth scoped to the tag publisher", () => {
  const workflow = readFileSync(join(root, ".github/workflows/release.yml"), "utf8");
  assert.doesNotMatch(workflow, /id-token:\s*write/);
  const registryUrls = workflow.match(/registry-url: "https:\/\/registry\.npmjs\.org"/g) ?? [];
  assert.equal(registryUrls.length, 1);
  assert.match(workflow, /group: npm-publish-pi-wishcraft/);
});

test("CHANGELOG.md keeps a well-formed Unreleased section for release.mjs to rewrite", () => {
  const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
  assert.match(changelog, /^# Changelog\n\n## \[Unreleased\]\n/);
});

test("extractChangelogNotes returns the section under ## [version]", () => {
  const changelog = `# Changelog

## [Unreleased]

## [1.2.3] - 2026-08-20

### Fixed
- First.

## [1.2.2] - 2026-08-19

### Added
- Older.
`;
  assert.equal(
    extractChangelogNotes(changelog, "1.2.3"),
    "### Fixed\n- First.",
  );
  assert.equal(
    extractChangelogNotes(changelog, "1.2.2"),
    "### Added\n- Older.",
  );
  assert.equal(extractChangelogNotes(changelog, "9.9.9"), "");
  assert.throws(() => extractChangelogNotes(changelog, "v1.2.3"), /Invalid version/);
});

test("release.mjs notes prints the CHANGELOG section for a shipped version", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/release.mjs", "notes", "0.22.2"],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Queue archive cutoff/);
  assert.doesNotMatch(result.stdout, /## \[0\.22\.1\]/);
});

test("github-release.sh fails closed without GITHUB_TOKEN", () => {
  const env = { ...process.env };
  delete env.GITHUB_TOKEN;
  delete env.GH_TOKEN;
  const result = spawnSync("sh", ["scripts/github-release.sh"], {
    cwd: root,
    env,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /GITHUB_TOKEN is missing/);
});

const STUB_CURL = `#!/bin/sh
out=""
method="GET"
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    -w) shift 2 ;;
    -X) method="$2"; shift 2 ;;
    -H) shift 2 ;;
    -d|--data|--data-binary) shift 2 ;;
    -sS|-s|-S) shift ;;
    -*) shift ;;
    *) url="$1"; shift ;;
  esac
done
if echo "$url" | grep -q '/releases/tags/'; then
  [ -n "$out" ] && printf '%s\\n' "{\\"message\\":\\"Not Found\\"}" > "$out"
  echo "\${STUB_VIEW_HTTP:-404}"
  exit 0
fi
if echo "$url" | grep -q '/releases$'; then
  [ -n "\${STUB_CREATE_MARKER:-}" ] && printf '%s\\n' "$method $url" > "$STUB_CREATE_MARKER"
  if [ "\${STUB_CREATE_HTTP:-201}" = "422" ]; then
    [ -n "$out" ] && printf '%s\\n' '{"errors":[{"code":"already_exists"}]}' > "$out"
  else
    [ -n "$out" ] && printf '%s\\n' '{"html_url":"https://example.test/release"}' > "$out"
  fi
  echo "\${STUB_CREATE_HTTP:-201}"
  exit 0
fi
echo 500
exit 0
`;

function withStubCurl() {
  const binDir = mkdtempSync(join(tmpdir(), "pi-wishcraft-gh-release-bin-"));
  const curlPath = join(binDir, "curl");
  writeFileSync(curlPath, STUB_CURL);
  chmodSync(curlPath, 0o755);
  return {
    binDir,
    cleanup() {
      rmSync(binDir, { recursive: true, force: true });
    },
  };
}

function runGithubReleaseScript(
  binDir: string,
  extraEnv: Record<string, string | undefined> = {},
) {
  return spawnSync("sh", [join(root, "scripts/github-release.sh"), pkgVersion], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
      GITHUB_TOKEN: "fake-token-for-tests",
      GITHUB_REPOSITORY: "GroepOnline/pi-wishcraft",
      ...extraEnv,
    },
  });
}

test("github-release.sh skips create when the tag already has a Release", () => {
  const { binDir, cleanup } = withStubCurl();
  try {
    const marker = join(binDir, "create-called");
    const result = runGithubReleaseScript(binDir, {
      STUB_VIEW_HTTP: "200",
      STUB_CREATE_MARKER: marker,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /already exists; skip/);
    assert.equal(existsSync(marker), false, "create should not run");
  } finally {
    cleanup();
  }
});

test("github-release.sh creates a Release when the tag has none", () => {
  const { binDir, cleanup } = withStubCurl();
  try {
    const marker = join(binDir, "create-called");
    const result = runGithubReleaseScript(binDir, {
      STUB_VIEW_HTTP: "404",
      STUB_CREATE_HTTP: "201",
      STUB_CREATE_MARKER: marker,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(
      result.stdout,
      new RegExp(`Created GitHub release v${pkgVersion.replaceAll(".", "\\.")}`),
    );
    assert.equal(existsSync(marker), true, "create should run");
    assert.match(readFileSync(marker, "utf8"), /POST /);
  } finally {
    cleanup();
  }
});

test("github-release.sh treats 422 already_exists as a successful skip", () => {
  const { binDir, cleanup } = withStubCurl();
  try {
    const result = runGithubReleaseScript(binDir, {
      STUB_VIEW_HTTP: "404",
      STUB_CREATE_HTTP: "422",
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /already exists; skip/);
  } finally {
    cleanup();
  }
});

test("github-release.sh fails when the requested version does not match package.json", () => {
  const { binDir, cleanup } = withStubCurl();
  try {
    const result = spawnSync(
      "sh",
      [join(root, "scripts/github-release.sh"), "9.9.9"],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH}`,
          GITHUB_TOKEN: "fake-token-for-tests",
          GITHUB_REPOSITORY: "GroepOnline/pi-wishcraft",
        },
      },
    );
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /does not match package.json/);
  } finally {
    cleanup();
  }
});

test(".github/workflows/release.yml creates a GitHub Release only after tag publication", () => {
  const workflow = readFileSync(join(root, ".github/workflows/release.yml"), "utf8");
  const releaseSteps = workflow.match(/run: sh scripts\/github-release\.sh/g) ?? [];
  assert.equal(releaseSteps.length, 1, "candidate preparation must not create a GitHub Release");
  assert.match(workflow, /GITHUB_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/);
  const publishJob = workflow.slice(workflow.indexOf("name: test + publish"));
  assert.match(publishJob, /contents:\s*write/);
  assert.match(
    publishJob,
    /run: sh scripts\/github-release\.sh "\$\{GITHUB_REF_NAME\}"/,
  );
  const npmIndex = workflow.indexOf("run: sh scripts/npm-publish.sh");
  const ghIndex = workflow.indexOf("run: sh scripts/github-release.sh");
  assert.ok(ghIndex > npmIndex, "GitHub Release step must come after npm publish");
});
