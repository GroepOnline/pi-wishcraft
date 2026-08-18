#!/usr/bin/env node
// ponytail: zero-dep release helper. Bumps version, rolls CHANGELOG, tags, pushes.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = join(root, "package.json");
const changelogPath = join(root, "CHANGELOG.md");

function bump(version, kind) {
  const [major, minor, patch] = version.split(".").map(Number);
  if (kind === "major") return `${major + 1}.0.0`;
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  if (kind === "patch") return `${major}.${minor}.${patch + 1}`;
  return kind; // explicit version like "1.2.3"
}

const arg = process.argv[2] || "patch";
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const next = bump(pkg.version, arg);
if (!/^\d+\.\d+\.\d+$/.test(next)) {
  console.error(`Invalid version: ${next}`);
  process.exit(1);
}

// package.json
pkg.version = next;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

// CHANGELOG: replace [Unreleased] header with [next] - date
const date = new Date().toISOString().slice(0, 10);
let changelog = readFileSync(changelogPath, "utf8");
if (changelog.includes("## [Unreleased]")) {
  changelog = changelog.replace("## [Unreleased]", `## [${next}] - ${date}`);
  writeFileSync(changelogPath, changelog);
  console.log(`CHANGELOG: [Unreleased] -> [${next}] - ${date}`);
} else {
  console.log("No [Unreleased] section; leaving CHANGELOG as-is.");
}

const tag = `v${next}`;
execSync(`git add package.json CHANGELOG.md`, { cwd: root, stdio: "inherit" });
execSync(`git commit -m "chore: release ${next}"`, { cwd: root, stdio: "inherit" });
execSync(`git tag -a ${tag} -m "Release ${next}"`, { cwd: root, stdio: "inherit" });

console.log(`\nRelease ${next} tagged as ${tag}.`);
console.log("Push with:\n  git push origin HEAD --tags");
console.log("After publish, confirm the Pi catalog card:");
console.log("  https://pi.dev/packages/@groeponline/pi-wishcraft");
console.log("  https://pi.dev/packages?name=wishcraft");
console.log("  https://pi.dev/packages?name=groeponline");
