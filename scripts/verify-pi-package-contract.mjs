import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DOCS = "https://pi.dev/docs/latest/packages";
const packageRoot = path.resolve(process.argv[2] || process.cwd());
const packageJsonPath = path.join(packageRoot, "package.json");
const failures = [];
const notes = [];
const fail = (message) => failures.push(message);
const normalize = (value) => String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
const globPattern = /[*?{}[\]]/;
const codeExt = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const core = [
  "@earendil-works/pi-ai",
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-tui",
  "typebox",
];

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
const resourcesByKey = new Map();
for (const key of resourceKeys) {
  const values = pi?.[key];
  if (values !== undefined && !Array.isArray(values)) {
    fail(`pi.${key} must be an array when present`);
    continue;
  }
  resourcesByKey.set(key, values || []);
}
if (![...resourcesByKey.values()].some((values) => values.length)) fail("pi manifest must expose at least one extension, skill, prompt, or theme resource");

const preview = pi?.video || pi?.image;
if (!preview) fail("GroepOnline gallery standard requires pi.video or pi.image");
for (const [field, allowed] of [["video", [".mp4"]], ["image", [".png", ".jpg", ".jpeg", ".gif", ".webp"]]]) {
  const value = pi?.[field];
  if (!value) continue;
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`pi.${field} must be an absolute HTTPS URL`);
    continue;
  }
  if (url.protocol !== "https:") fail(`pi.${field} must use HTTPS`);
  const ext = path.extname(url.pathname).toLowerCase();
  if (!allowed.includes(ext)) fail(`pi.${field} has unsupported format ${ext || "(none)"}; allowed: ${allowed.join(", ")}`);
}

let repoRoot = null;
try {
  repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: packageRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
} catch {
  notes.push("git root unavailable; skipped same-repo preview asset existence check");
}
if (repoRoot) {
  for (const field of ["image", "video"]) {
    const value = pi?.[field];
    const match = typeof value === "string" && value.match(/^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/main\/(.+)$/);
    if (match && !fs.existsSync(path.join(repoRoot, match[1]))) fail(`pi.${field} points at a same-repo raw asset that does not exist: ${match[1]}`);
  }
}

const insidePackage = (candidate) => {
  const resolved = path.resolve(packageRoot, candidate);
  const relative = path.relative(packageRoot, resolved);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
};

const assertResourcePattern = (key, raw) => {
  if (typeof raw !== "string" || !raw.trim()) {
    fail(`pi.${key} contains an invalid resource path`);
    return null;
  }
  const negative = raw.startsWith("!");
  const clean = normalize(negative ? raw.slice(1) : raw);
  if (!clean || clean.includes("\0") || path.isAbsolute(clean) || path.posix.isAbsolute(clean) || path.win32.isAbsolute(clean) || !insidePackage(clean)) {
    fail(`pi.${key} resource escapes package root: ${raw}`);
    return null;
  }
  return { clean, negative };
};

const collectFiles = (relativePath, out) => {
  const local = path.resolve(packageRoot, relativePath);
  if (!insidePackage(relativePath) || !fs.existsSync(local)) return;
  const real = fs.realpathSync(local);
  const rootReal = fs.realpathSync(packageRoot);
  const realRelative = path.relative(rootReal, real);
  if (realRelative === ".." || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) {
    fail(`resource resolves through a symlink outside package root: ${relativePath}`);
    return;
  }
  const stat = fs.statSync(local);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(local, { withFileTypes: true })) {
      collectFiles(normalize(path.relative(packageRoot, path.join(local, entry.name))), out);
    }
    return;
  }
  if (stat.isFile()) out.add(normalize(path.relative(packageRoot, local)));
};

const expandPattern = (key, entry) => {
  const matches = new Set();
  if (globPattern.test(entry.clean)) {
    if (typeof fs.globSync !== "function") {
      fail("glob resources require Node.js >= 22");
      return matches;
    }
    for (const match of fs.globSync(entry.clean, { cwd: packageRoot })) collectFiles(normalize(match), matches);
    if (!entry.negative && matches.size === 0) fail(`pi.${key} resource glob matches nothing: ${entry.clean}`);
  } else if (!fs.existsSync(path.resolve(packageRoot, entry.clean))) {
    if (!entry.negative) fail(`pi.${key} resource does not exist after build: ${entry.clean}`);
  } else {
    collectFiles(entry.clean, matches);
  }
  return matches;
};

const resourceFiles = new Map();
for (const [key, values] of resourcesByKey) {
  const included = new Set();
  const excluded = new Set();
  let positives = 0;
  for (const raw of values) {
    const entry = assertResourcePattern(key, raw);
    if (!entry) continue;
    if (!entry.negative) positives += 1;
    const matches = expandPattern(key, entry);
    for (const file of matches) (entry.negative ? excluded : included).add(file);
  }
  for (const file of excluded) included.delete(file);
  if (positives > 0 && included.size === 0) fail(`pi.${key} resolves to no packaged files after exclusions`);
  resourceFiles.set(key, included);
}

const peer = pkg.peerDependencies || {};
for (const dep of core) {
  if (peer[dep] !== undefined && peer[dep] !== "*") fail(`Pi core peer ${dep} must use "*", found ${JSON.stringify(peer[dep])}`);
  if (pkg.dependencies?.[dep] !== undefined) fail(`Pi core package ${dep} must not be in dependencies; use peerDependencies: "*"`);
  if ((pkg.bundledDependencies || pkg.bundleDependencies || []).includes(dep)) fail(`Pi core package ${dep} must not be bundled`);
}

let packed = null;
try {
  packed = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--ignore-scripts", "--json"], {
    cwd: packageRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }))[0];
} catch (error) {
  fail(`npm pack --dry-run failed: ${error.stderr?.toString().trim() || error.message}`);
}

const packedFiles = new Set((packed?.files || []).map((file) => normalize(file.path)));
if (packed) {
  if (!packedFiles.has("package.json")) fail("npm tarball is missing package.json");
  if (![...packedFiles].some((file) => /^readme(?:\.|$)/i.test(file))) fail("npm tarball is missing README");
  for (const [key, files] of resourceFiles) {
    for (const file of files) {
      if (!packedFiles.has(file)) fail(`pi.${key} resource file is not present in npm tarball: ${file}`);
    }
  }
  notes.push(`${packed.files?.length || 0} packed files, ${packed.size || 0} bytes`);
}

const runtimePath = (file) => {
  const parts = normalize(file).split("/");
  if (parts.some((part) => ["test", "tests", "scripts", "docs", "examples", "fixtures", "coverage"].includes(part))) return false;
  if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file)) return false;
  return codeExt.has(path.extname(file));
};
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const importsDependency = (text, dep) => {
  const d = escapeRegExp(dep);
  return [
    new RegExp(`\\b(?:import|export)\\s+(?:type\\s+)?(?:[^;\\n]*?\\s+from\\s+)?["']${d}(?:\\/[^"']*)?["']`),
    new RegExp(`\\b(?:import|require)\\s*\\(\\s*["']${d}(?:\\/[^"']*)?["']`),
  ].some((pattern) => pattern.test(text));
};
const runtimeFiles = [...packedFiles].filter(runtimePath);
const runtimeText = runtimeFiles.map((file) => {
  const local = path.join(packageRoot, file);
  return fs.existsSync(local) ? stripComments(fs.readFileSync(local, "utf8")) : "";
}).join("\n");
for (const dep of core) {
  if (importsDependency(runtimeText, dep) && peer[dep] !== "*") fail(`packed runtime imports ${dep}; peerDependencies.${dep} must be "*"`);
}
if (importsDependency(runtimeText, "@sinclair/typebox") && pkg.dependencies?.["@sinclair/typebox"] === undefined) {
  fail('packed runtime imports @sinclair/typebox; it is third-party under the current Pi contract and must be in dependencies (Pi core is the separate "typebox" package)');
}

if (failures.length) {
  console.error("Pi package contract FAILED");
  for (const message of failures) console.error(`- ${message}`);
  console.error(`Docs: ${DOCS}`);
  process.exit(1);
}
console.log(`Pi package contract OK: ${pkg.name}@${pkg.version}`);
for (const note of notes) console.log(`- ${note}`);
