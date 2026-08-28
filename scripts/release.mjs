#!/usr/bin/env node
// Zero-dep release helper. Bumps version, rolls CHANGELOG, tags.
// Local: npm run release [patch|minor|major|auto|x.y.z]
// CI:    node scripts/release.mjs auto --push
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = join(root, "package.json");
const changelogPath = join(root, "CHANGELOG.md");
const lockPath = join(root, "package-lock.json");

export function bump(version, kind) {
  const [major, minor, patch] = version.split(".").map(Number);
  if (kind === "major") return `${major + 1}.0.0`;
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  if (kind === "patch") return `${major}.${minor}.${patch + 1}`;
  return kind;
}

export function shouldSkipRelease(message) {
  const subject = (message ?? "").trim();
  return /^chore:\s*release\b/i.test(subject) || /\[skip release\]/i.test(subject);
}

export function chooseBump(subjects) {
  // Conservative by default: a normal `feat:` lands as a patch bump, not a
  // minor. Minor-race (1.4 -> 1.5 -> 1.6 -> 1.7 in days) was the failure
  // here: every feat PR burned a minor while the real feature depth was a
  // few patches. Only an explicit breaking `!:`/"breaking change" is
  // auto-promoted to major; minor stays an explicit manual choice
  // (`node scripts/release.mjs minor`).
  let level = "patch";
  for (const raw of subjects) {
    const subject = raw.trim();
    if (!subject || /^chore:\s*release\b/i.test(subject)) continue;
    if (/^(\w+)(\([^)]+\))?!:/.test(subject) || /breaking change/i.test(subject)) {
      return "major";
    }
  }
  return level;
}

function git(command) {
  return execSync(command, { cwd: root, encoding: "utf8" }).trim();
}

function lastReleaseTag() {
  try {
    return parseLatestVersionTag(git("git tag -l 'v*'").split("\n"));
  } catch {
    return null;
  }
}

function refExists(ref) {
  try {
    git(`git rev-parse -q --verify ${ref}`);
    return true;
  } catch {
    return false;
  }
}

function commitSubjectsSince(tag) {
  const range = tag ? `${tag}..HEAD` : "HEAD";
  const log = git(`git log ${range} --pretty=%s`);
  return log.split("\n").map((line) => line.trim()).filter(Boolean);
}

function parseArgs(argv) {
  const flags = new Set(argv.filter((arg) => arg.startsWith("--")));
  const kind = argv.find((arg) => !arg.startsWith("--")) ?? "patch";
  return { flags, kind };
}

export function parseLatestVersionTag(names) {
  const versions = names
    .map((name) => name.trim())
    .filter((name) => /^v\d+\.\d+\.\d+$/.test(name))
    .map((tag) => ({
      tag,
      parts: tag.slice(1).split(".").map(Number),
    }));
  versions.sort(
    (a, b) => a.parts[0] - b.parts[0] || a.parts[1] - b.parts[1] || a.parts[2] - b.parts[2],
  );
  return versions.at(-1)?.tag ?? null;
}

export function resolveReleaseVersion(current, kindArg, subjects) {
  const kind = kindArg === "auto" ? chooseBump(subjects) : kindArg;
  const next = bump(current, kind);
  if (!/^\d+\.\d+\.\d+$/.test(next)) {
    throw new Error(`Invalid version: ${next}`);
  }
  return { kind, next };
}

export function existingTagAction(currentVersion, next, tagExists) {
  if (!tagExists) return "cut";
  if (currentVersion === next) return "already-cut";
  return "collision";
}

export function rewriteUnreleasedHeading(changelog, next, date) {
  const unreleasedHeading = /^## \[Unreleased\][ \t]*$/m;
  if (!unreleasedHeading.test(changelog)) {
    return { changelog, rewritten: false };
  }
  return {
    changelog: changelog.replace(
      unreleasedHeading,
      `## [Unreleased]\n\n## [${next}] - ${date}`,
    ),
    rewritten: true,
  };
}

export function rewritePackageLockVersion(lockText, next) {
  const lock = JSON.parse(lockText);
  lock.version = next;
  if (lock.packages?.[""]) lock.packages[""].version = next;
  return JSON.stringify(lock, null, 2) + "\n";
}

export function parseReleaseCandidateBranch(branch) {
  const match = /^release-candidate\/v(\d+\.\d+\.\d+)-([0-9a-f]{12})$/.exec(branch);
  if (!match) return null;
  return { version: match[1], parentPrefix: match[2] };
}

export function validateReleaseCandidateMetadata({
  branch,
  subject,
  packageVersion,
  changedFiles,
  changelog,
  parentSha,
}) {
  const parsed = parseReleaseCandidateBranch(branch);
  if (!parsed) throw new Error(`Invalid release candidate branch: ${branch}`);
  if (!parentSha.startsWith(parsed.parentPrefix)) {
    throw new Error(`Candidate branch parent prefix does not match ${parentSha}.`);
  }
  if (subject !== `chore: release ${parsed.version}`) {
    throw new Error(`Unexpected release candidate subject: ${subject}`);
  }
  if (packageVersion !== parsed.version) {
    throw new Error(`Candidate package version ${packageVersion} != ${parsed.version}.`);
  }
  const actual = [...new Set(changedFiles)].sort();
  const expected = ["CHANGELOG.md", "package-lock.json", "package.json"];
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Unexpected release candidate files: ${actual.join(", ")}`);
  }
  const hasHeading = changelog
    .split("\n")
    .some((line) => line.startsWith(`## [${parsed.version}]`));
  if (!hasHeading) {
    throw new Error(`CHANGELOG is missing ${parsed.version}.`);
  }
  return parsed.version;
}

/** Body under `## [version]` up to the next heading. Empty when missing. */
export function extractChangelogNotes(changelog, version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Invalid version: ${version}`);
  }
  const heading = new RegExp(`^## \\[${version.replace(/\\./g, "\\\\.")}\\][^\\n]*\\n`, "m");
  const match = heading.exec(changelog);
  if (!match) return "";
  const rest = changelog.slice(match.index + match[0].length);
  const next = rest.search(/^## \[/m);
  return (next === -1 ? rest : rest.slice(0, next)).trim();
}

function main() {
  const { flags, kind: kindArg } = parseArgs(process.argv.slice(2));
  const headSubject = git("git log -1 --pretty=%s");
  if (flags.has("--push") && shouldSkipRelease(headSubject)) {
    console.log(`Skipping release (${headSubject}).`);
    return;
  }

  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const tagBase = lastReleaseTag();
  const { kind, next } = resolveReleaseVersion(
    pkg.version,
    kindArg,
    commitSubjectsSince(tagBase),
  );
  const tag = `v${next}`;

  if (flags.has("--dry-run")) {
    console.log(`Would release ${next} (${kind}) as ${tag} since ${tagBase ?? "no tag"}.`);
    return;
  }

  const tagAction = existingTagAction(
    pkg.version,
    next,
    refExists(`refs/tags/${tag}`),
  );
  if (tagAction === "already-cut") {
    console.log(
      `Tag ${tag} already exists and package.json is ${next}; skip bump.`,
    );
    return;
  }
  if (tagAction === "collision") {
    throw new Error(
      `Tag ${tag} already exists; refusing to bump ${pkg.version} -> ${next}.`,
    );
  }

  pkg.version = next;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  if (existsSync(lockPath)) {
    writeFileSync(
      lockPath,
      rewritePackageLockVersion(readFileSync(lockPath, "utf8"), next),
    );
  }

  const date = new Date().toISOString().slice(0, 10);
  const changelog = readFileSync(changelogPath, "utf8");
  const rolled = rewriteUnreleasedHeading(changelog, next, date);
  if (rolled.rewritten) {
    writeFileSync(changelogPath, rolled.changelog);
    console.log(`CHANGELOG: [Unreleased] -> [${next}] - ${date}`);
  } else {
    console.log("No [Unreleased] section; leaving CHANGELOG as-is.");
  }

  execSync("git add package.json package-lock.json CHANGELOG.md", { cwd: root, stdio: "inherit" });
  execSync(`git commit -m "chore: release ${next}"`, { cwd: root, stdio: "inherit" });
  execSync(`git tag -a ${tag} -m "Release ${next}"`, { cwd: root, stdio: "inherit" });

  console.log(`\nRelease ${next} tagged as ${tag}.`);
  if (flags.has("--push")) {
    execSync("git push origin HEAD:refs/heads/main", { cwd: root, stdio: "inherit" });
    execSync(`git push origin refs/tags/${tag}`, { cwd: root, stdio: "inherit" });
    console.log(`Pushed main and ${tag}.`);
  } else {
    console.log(`Push with:\n  git push origin HEAD refs/tags/${tag}`);
  }
  console.log("After publish, confirm the Pi catalog card:");
  console.log("  https://pi.dev/packages/@groeponline/pi-wishcraft");
  console.log("  https://pi.dev/packages?name=wishcraft");
  console.log("  https://pi.dev/packages?name=groeponline");
}

const invokedAsCli =
  Boolean(process.argv[1]) &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsCli) {
  try {
    if (process.argv[2] === "notes") {
      const version = process.argv[3];
      if (!version) throw new Error("usage: node scripts/release.mjs notes <version>");
      const changelog = readFileSync(changelogPath, "utf8");
      process.stdout.write(extractChangelogNotes(changelog, version) + "\n");
    } else if (process.argv[2] === "next") {
      const kindArg = process.argv[3] ?? "auto";
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      const tagBase = lastReleaseTag();
      const { next } = resolveReleaseVersion(
        pkg.version,
        kindArg,
        commitSubjectsSince(tagBase),
      );
      process.stdout.write(next + "\n");
    } else if (process.argv[2] === "candidate-check") {
      const branch = process.argv[3];
      const sha = process.argv[4];
      const parentSha = process.argv[5];
      if (!branch || !sha || !parentSha) {
        throw new Error("usage: node scripts/release.mjs candidate-check <branch> <sha> <parent-sha>");
      }
      if (!/^[0-9a-f]{40}$/.test(sha) || !/^[0-9a-f]{40}$/.test(parentSha)) {
        throw new Error("candidate-check requires full commit SHAs");
      }
      const actualParent = git(`git rev-parse ${sha}^`);
      if (actualParent !== parentSha) {
        throw new Error(`Candidate parent ${actualParent} != expected ${parentSha}.`);
      }
      const subject = git(`git show -s --format=%s ${sha}`);
      const packageVersion = JSON.parse(git(`git show ${sha}:package.json`)).version;
      const changedFiles = git(`git diff-tree --no-commit-id --name-only -r ${sha}`)
        .split("\n")
        .filter(Boolean);
      const changelog = git(`git show ${sha}:CHANGELOG.md`);
      const version = validateReleaseCandidateMetadata({
        branch, subject, packageVersion, changedFiles, changelog, parentSha,
      });
      process.stdout.write(version + "\n");
    } else {
      main();
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
