import assert from "node:assert/strict";
import test from "node:test";
import {
  bump,
  chooseBump,
  existingTagAction,
  extractChangelogNotes,
  extractUnreleasedNotes,
  parseLatestVersionTag,
  parseReleaseCandidateBranch,
  resolveReleaseVersion,
  rewritePackageLockVersion,
  rewriteUnreleasedHeading,
  shouldSkipRelease,
  validateReleaseCandidateMetadata,
} from "../scripts/release.mjs";

test("release: bump handles the three semver kinds and passes explicit versions through", () => {
  assert.equal(bump("1.13.0", "patch"), "1.13.1");
  assert.equal(bump("1.13.0", "minor"), "1.14.0");
  assert.equal(bump("1.13.0", "major"), "2.0.0");
  assert.equal(bump("1.13.0", "1.14.0"), "1.14.0");
});

test("release: shouldSkipRelease matches the documented subject forms only", () => {
  assert.equal(shouldSkipRelease("chore: release 1.13.0"), true);
  assert.equal(shouldSkipRelease("feat: [skip release] hides this"), true);
  assert.equal(shouldSkipRelease("chore(release): 1.0.0"), false, "only bare chore: release");
  assert.equal(shouldSkipRelease("feat: normal work"), false);
  assert.equal(shouldSkipRelease(""), false);
  assert.equal(shouldSkipRelease(undefined), false);
});

test("release: chooseBump follows org policy — minor default, major on breaking", () => {
  assert.equal(chooseBump(["feat: a", "fix: b"]), "minor");
  assert.equal(chooseBump(["fix: a", "feat(core)!: breaking change"]), "major");
  assert.equal(chooseBump(["fix: fine", "docs: mentions breaking change in prose"]), "major");
  assert.equal(chooseBump(["chore: release 1.2.3"]), "patch", "release-only history");
  assert.equal(chooseBump([]), "patch");
});

test("release: parseLatestVersionTag picks the highest vX.Y.Z and ignores the rest", () => {
  assert.equal(
    parseLatestVersionTag(["v1.2.3", "v1.10.0", "v1.9.9", "not-a-tag", ""]),
    "v1.10.0",
  );
  assert.equal(parseLatestVersionTag([]), null);
  assert.equal(parseLatestVersionTag(["junk"]), null);
});

test("release: resolveReleaseVersion validates explicit kinds and rejects junk", () => {
  const { kind, next } = resolveReleaseVersion("1.13.0", "auto", ["feat: a"]);
  assert.equal(kind, "minor");
  assert.equal(next, "1.14.0");
  assert.throws(() => resolveReleaseVersion("1.13.0", "banana", []), /Invalid version/);
});

test("release: existingTagAction cuts, detects already-cut and collisions", () => {
  assert.equal(existingTagAction("1.13.0", "1.13.1", false), "cut");
  assert.equal(existingTagAction("1.13.1", "1.13.1", true), "already-cut");
  assert.equal(existingTagAction("1.13.0", "1.13.1", true), "collision");
});

test("release: rewriteUnreleasedHeading rolls notes and reports no-op safely", () => {
  const changelog = "# Changelog\n\n## [Unreleased]\n\n### Added\n- thing\n\n## [1.0.0] - 2026-01-01\n";
  const rolled = rewriteUnreleasedHeading(changelog, "1.1.0", "2026-09-29");
  assert.equal(rolled.rewritten, true);
  assert.match(rolled.changelog, /## \[Unreleased\]\n\n## \[1\.1\.0\] - 2026-09-29/);
  assert.match(rolled.changelog, /### Added\n- thing/);

  const missing = rewriteUnreleasedHeading("# Changelog\n\n## [1.0.0] - 2026-01-01\n", "1.1.0", "2026-09-29");
  assert.equal(missing.rewritten, false);
  // No [Unreleased] heading: the file is returned untouched — the notes-less
  // release flow never rewrites history it does not understand.
  assert.equal(missing.changelog, "# Changelog\n\n## [1.0.0] - 2026-01-01\n");
});

test("release: extractUnreleasedNotes finds notes, and empty notes mean nothing to release", () => {
  const withNotes = "## [Unreleased]\n\n### Added\n- a\n- b\n\n## [1.0.0] - 2026-01-01\n";
  assert.equal(extractUnreleasedNotes(withNotes), "### Added\n- a\n- b");
  assert.equal(extractUnreleasedNotes("## [Unreleased]\n\n## [1.0.0]\n"), "");
  assert.equal(extractUnreleasedNotes("no unreleased section at all"), "");
});

test("release: extractChangelogNotes scopes to the version body", () => {
  const changelog = "## [Unreleased]\n\n## [1.2.0] - 2026-09-01\n\n### Fixed\n- x\n\n## [1.1.0]\n";
  assert.equal(extractChangelogNotes(changelog, "1.2.0"), "### Fixed\n- x");
  assert.equal(extractChangelogNotes(changelog, "9.9.9"), "");
  assert.throws(() => extractChangelogNotes(changelog, "not-semver"), /Invalid version/);
});

test("release: rewritePackageLockVersion updates root and workspace entries", () => {
  const lock = JSON.stringify({ name: "x", version: "1.0.0", packages: { "": { version: "1.0.0" } } });
  const next = rewritePackageLockVersion(lock, "2.0.0");
  const parsed = JSON.parse(next);
  assert.equal(parsed.version, "2.0.0");
  assert.equal(parsed.packages[""].version, "2.0.0");
  assert.match(next, /\n$/, "lockfile ends with a newline");
});

test("release: release-candidate branch names parse and validate end to end", () => {
  const parsed = parseReleaseCandidateBranch("release-candidate/v1.14.0-abc123def456");
  assert.deepEqual(parsed, { version: "1.14.0", parentPrefix: "abc123def456" });
  assert.equal(parseReleaseCandidateBranch("release/main"), null);

  const ok = validateReleaseCandidateMetadata({
    branch: "release-candidate/v1.14.0-abc123def456",
    subject: "chore: release 1.14.0",
    packageVersion: "1.14.0",
    changedFiles: ["package-lock.json", "CHANGELOG.md", "package.json"],
    changelog: "## [Unreleased]\n\n## [1.14.0] - 2026-09-29\n\n- notes\n",
    parentSha: "abc123def4569999999999999999999999999999",
  });
  assert.equal(ok, "1.14.0");
});

test("release: candidate metadata rejects every contract violation", () => {
  const base = {
    branch: "release-candidate/v1.14.0-abc123def456",
    subject: "chore: release 1.14.0",
    packageVersion: "1.14.0",
    changedFiles: ["CHANGELOG.md", "package-lock.json", "package.json"],
    changelog: "## [1.14.0] - 2026-09-29\n",
    parentSha: "abc123def4569999999999999999999999999999",
  };
  assert.throws(
    () => validateReleaseCandidateMetadata({ ...base, branch: "feature/whatever" }),
    /Invalid release candidate branch/,
  );
  assert.throws(
    () => validateReleaseCandidateMetadata({ ...base, parentSha: "0000000000009999999999999999999999999999" }),
    /parent prefix does not match/,
  );
  assert.throws(
    () => validateReleaseCandidateMetadata({ ...base, subject: "chore: release 9.9.9" }),
    /Unexpected release candidate subject/,
  );
  assert.throws(
    () => validateReleaseCandidateMetadata({ ...base, packageVersion: "1.13.0" }),
    /Candidate package version/,
  );
  assert.throws(
    () => validateReleaseCandidateMetadata({ ...base, changedFiles: ["package.json", "src/rogue.ts"] }),
    /Unexpected release candidate files/,
  );
  assert.throws(
    () => validateReleaseCandidateMetadata({ ...base, changelog: "## [1.13.0]\n" }),
    /CHANGELOG is missing 1\.14\.0/,
  );
});
