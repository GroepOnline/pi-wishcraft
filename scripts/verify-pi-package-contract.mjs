#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DOCS = "https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md";
const packageRoot = path.resolve(process.argv[2] || process.cwd());
const packageJsonPath = path.join(packageRoot, "package.json");
const failures = [];
const notes = [];
const fail = (message) => failures.push(message);
const normalize = (value) => String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");

if (!fs.existsSync(packageJsonPath)) {
  console.error(`Pi package contract: package.json not found at ${packageJsonPath}`);
  process.exit(2);
}
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const pi = pkg.pi;

if (!pkg.name) fail("package.json needs a package name");
if (pkg.private === true) fail("package must not be private");
if (!Array.isArray(pkg.keywords) || !pkg.keywords.includes("pi-package")) fail('keywords must include "pi-package"');
if (String(pkg.name || "").startsWith("@groeponline/") && !pkg.keywords?.includes("groeponline")) fail('GroepOnline packages must include the "groeponline" keyword');
if (typeof pkg.description !== "string" || pkg.description.trim().length < 40 || pkg.description.length > 240) fail("description must be 40-240 characters of useful gallery copy");
for (const field of ["author", "license", "repository", "homepage", "bugs"]) {
  if (!pkg[field]) fail(`missing package metadata: ${field}`);
}
if (String(pkg.name || "").startsWith("@") && pkg.publishConfig?.access !== "public") fail('scoped public Pi packages need publishConfig.access = "public"');
if (!pi || typeof pi !== "object" || Array.isArray(pi)) fail("explicit pi manifest is required by the GroepOnline release standard");

const resourceKeys = ["extensions", "skills", "prompts", "themes"];
const resources = [];
if (pi) {
  for (const key of resourceKeys) {
    if (pi[key] !== undefined && !Array.isArray(pi[key])) fail(`pi.${key} must be an array when present`);
    for (const value of pi[key] || []) resources.push([key, value]);
  }
}
if (!resources.length) fail("pi manifest must expose at least one extension, skill, prompt, or theme resource");

const preview = pi?.video || pi?.image;
if (!preview) fail("GroepOnline gallery standard requires pi.video or pi.image");
for (const [field, allowed] of [["video", [".mp4"]], ["image", [".png", ".jpg", ".jpeg", ".gif", ".webp"]]]) {
  const value = pi?.[field];
  if (!value) continue;
  let url;
  try { url = new URL(value); } catch { fail(`pi.${field} must be an absolute HTTPS URL`); continue; }
  if (url.protocol !== "https:") fail(`pi.${field} must use HTTPS`);
  const ext = path.extname(url.pathname).toLowerCase();
  if (!allowed.includes(ext)) fail(`pi.${field} has unsupported format ${ext || "(none)"}; allowed: ${allowed.join(", ")}`);
}

let repoRoot = packageRoot;
try { repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: packageRoot, encoding: "utf8" }).trim(); } catch {}
for (const field of ["image", "video"]) {
  const value = pi?.[field];
  const match = typeof value === "string" && value.match(/^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/main\/(.+)$/);
  if (match && !fs.existsSync(path.join(repoRoot, match[1]))) fail(`pi.${field} points at a same-repo raw asset that does not exist: ${match[1]}`);
}

for (const [key, raw] of resources) {
  if (typeof raw !== "string" || !raw.trim()) { fail(`pi.${key} contains an invalid resource path`); continue; }
  if (raw.startsWith("!")) continue;
  const clean = normalize(raw);
  if (clean.startsWith("../")) { fail(`pi.${key} resource escapes package root: ${raw}`); continue; }
  if (!/[?*{}[\]]/.test(clean) && !fs.existsSync(path.join(packageRoot, clean))) fail(`pi.${key} resource does not exist after build: ${raw}`);
}

const core = [
  "@earendil-works/pi-ai",
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-tui",
  "typebox",
];
const peer = pkg.peerDependencies || {};
for (const dep of core) {
  if (peer[dep] !== undefined && peer[dep] !== "*") fail(`Pi core peer ${dep} must use \"*\", found ${JSON.stringify(peer[dep])}`);
  if (pkg.dependencies?.[dep] !== undefined) fail(`Pi core package ${dep} must not be in dependencies; use peerDependencies: \"*\"`);
  if ((pkg.bundledDependencies || pkg.bundleDependencies || []).includes(dep)) fail(`Pi core package ${dep} must not be bundled`);
}

const skipDirs = new Set([".git", "node_modules", "dist", "target", "coverage", ".next", "build"]);
const codeExt = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
const sourceFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && skipDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (codeExt.has(path.extname(entry.name))) sourceFiles.push(full);
  }
}
walk(packageRoot);
const sourceText = sourceFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
for (const dep of core) {
  const d = escapeRegExp(dep);
  const imported = new RegExp(`(?:from\\s+|import\\s*\\(|require\\s*\\()\\s*[\"']${d}[\"']`).test(sourceText);
  if (imported && peer[dep] !== "*") fail(`runtime source imports ${dep}; peerDependencies.${dep} must be \"*\"`);
}

let packed = null;
try {
  packed = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--ignore-scripts", "--json"], { cwd: packageRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }))[0];
} catch (error) {
  fail(`npm pack --dry-run failed: ${error.stderr?.toString().trim() || error.message}`);
}
if (packed) {
  const packedFiles = new Set((packed.files || []).map((f) => normalize(f.path)));
  if (!packedFiles.has("package.json")) fail("npm tarball is missing package.json");
  if (![...packedFiles].some((f) => /^readme(?:\.|$)/i.test(f))) fail("npm tarball is missing README");
  for (const [key, raw] of resources) {
    if (raw.startsWith("!")) continue;
    const clean = normalize(raw);
    if (/[?*{}[\]]/.test(clean)) continue;
    const local = path.join(packageRoot, clean);
    if (!fs.existsSync(local)) continue;
    const stat = fs.statSync(local);
    const included = stat.isDirectory() ? [...packedFiles].some((f) => f.startsWith(clean.replace(/\/$/, "") + "/")) : packedFiles.has(clean);
    if (!included) fail(`pi.${key} resource is not present in npm tarball: ${raw}`);
  }
  notes.push(`${packed.files?.length || 0} packed files, ${packed.size || 0} bytes`);
}

if (failures.length) {
  console.error("Pi package contract FAILED");
  for (const message of failures) console.error(`- ${message}`);
  console.error(`Docs: ${DOCS}`);
  process.exit(1);
}
console.log(`Pi package contract OK: ${pkg.name}@${pkg.version}`);
for (const note of notes) console.log(`- ${note}`);
