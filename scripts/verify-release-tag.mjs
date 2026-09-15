#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function readPackageVersion(rootDir = root) {
  const pkg = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8"));
  const version = typeof pkg.version === "string" ? pkg.version.trim() : "";
  if (!version) throw new Error("package.json version is missing");
  return version;
}

export function versionSources(rootDir = root) {
  return { packageVersion: readPackageVersion(rootDir) };
}

export function expectedTag(version) {
  return `v${version}`;
}

export function sourcesAgree(sources = versionSources()) {
  if (!/^\d+\.\d+\.\d+$/.test(sources.packageVersion)) {
    throw new Error(`package.json version ${sources.packageVersion} is not stable X.Y.Z`);
  }
  return sources.packageVersion;
}

export function verifyTagEqualsVersion(tag, sources = versionSources()) {
  const version = sourcesAgree(sources);
  const expected = expectedTag(version);
  if (tag !== expected) {
    throw new Error(`tag ${tag} does not equal version source tag ${expected}`);
  }
  return { tag, version };
}

export function verifyAncestorOfMain(sha, mainRef = "origin/main") {
  const fetch = spawnSync("git", ["fetch", "--no-tags", "origin", "main"], {
    cwd: root,
    encoding: "utf8",
  });
  if (fetch.status !== 0) {
    throw new Error((fetch.stderr || "").trim() || "git fetch origin main failed");
  }
  const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", sha, mainRef], {
    cwd: root,
    encoding: "utf8",
  });
  if (ancestor.status !== 0) {
    throw new Error(`commit ${sha} is not an ancestor of ${mainRef}`);
  }
  return sha;
}

export function parseReleaseArgs(argv) {
  const out = { tag: null, sha: null, mainRef: "origin/main" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--tag") {
      out.tag = argv[i + 1];
      i += 1;
    } else if (arg === "--sha") {
      out.sha = argv[i + 1];
      i += 1;
    } else if (arg === "--main-ref") {
      out.mainRef = argv[i + 1];
      i += 1;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
    if (arg === "--tag" || arg === "--sha" || arg === "--main-ref") {
      if (argv[i] == null || String(argv[i]).startsWith("--")) {
        throw new Error(`missing value for ${arg}`);
      }
    }
  }
  return out;
}

function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error((result.stderr || "").trim() || `git ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

export function verifyCurrent(argv = process.argv.slice(2), env = process.env) {
  const args = parseReleaseArgs(argv);
  const tag = args.tag || env.GITHUB_REF_NAME;
  if (!tag) throw new Error("missing --tag or GITHUB_REF_NAME");
  const { version } = verifyTagEqualsVersion(tag);
  const sha = args.sha || git(["rev-parse", "HEAD"]);
  const tagSha = git(["rev-parse", `${tag}^{commit}`]);
  if (tagSha !== sha) {
    throw new Error(`tag ${tag} commit ${tagSha} does not match checked-out ${sha}`);
  }
  verifyAncestorOfMain(sha, args.mainRef);
  return { tag, version, sha };
}

function isDirectEntrypoint() {
  if (!process.argv[1]) return false;
  return fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}

if (isDirectEntrypoint()) {
  try {
    const result = verifyCurrent();
    process.stdout.write(
      `release tag contract OK (${result.tag} == package ${result.version}; ${result.sha.slice(0, 12)} on origin/main)\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  }
}
