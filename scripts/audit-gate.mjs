// Dependency audit gate (bun-native).
//
// `bun audit --audit-level=high` alone cannot be the gate here: the one
// remaining finding is unreachable, so the step would stay red forever and CI
// would either ignore it (which also ignores every *new* finding) or block
// every release. Neither is acceptable.
//
// So this script audits against an explicit baseline of accepted advisories:
//
//   - every accepted entry names one advisory by its GHSA id, the exact
//     vulnerable range it was accepted for, and a written reason, so a NEW
//     high/critical advisory -- or a moved range on an accepted one -- fails
//   - an installed copy at a version the baseline does not list fails, so a
//     second vulnerable copy of an accepted package is still caught
//   - a baselined advisory that no longer reports as blocking fails the build
//     too, because a stale baseline silently stops describing reality
//
// A `bun audit` that fails to run at all (registry down, config error) also
// fails the gate: an error envelope must never be read as "zero findings".
//
// Run it directly (`bun scripts/audit-gate.mjs`) or via `bun run audit`.
//
// Why bun's schema instead of npm's: npm audit reads package-lock.json, which
// this repository no longer keeps. npm's report also carries `nodes` (install
// paths); bun reports advisories per package name and `bun pm ls --all` names
// every installed version, so the same "a second vulnerable copy is ours"
// question is answered by version instead of by path.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const BLOCKING_SEVERITIES = new Set(["high", "critical"]);
const baselinePath = path.resolve(process.argv[2] || "audit-baseline.json");
const GHSA = /GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/i;

if (!fs.existsSync(baselinePath)) {
  console.error(`audit-gate: baseline not found at ${baselinePath}`);
  process.exit(2);
}

let baseline;
try {
  baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
} catch (error) {
  console.error(`audit-gate: cannot parse ${baselinePath}: ${error.message}`);
  process.exit(2);
}

const accepted = baseline.accepted || [];
const failures = [];
const notes = [];

// The baseline must justify itself. An entry with no reason is exactly the
// "inherited, trust me" note this gate exists to prevent, and an entry without
// an id or a recorded range cannot tell a new advisory -- or a moved range on
// an accepted one -- apart from the exempted case.
const seenIds = new Set();
for (const entry of accepted) {
  if (!entry.name || !entry.reason || !entry.id || !entry.range) {
    failures.push(
      `baseline entry ${JSON.stringify(entry.name)} needs a written reason, an advisory id (GHSA-…), and the vulnerable range it was accepted for`,
    );
    continue;
  }
  if (!GHSA.test(entry.id)) {
    failures.push(`baseline entry ${entry.name} has a malformed advisory id: ${entry.id}`);
  }
  if (seenIds.has(entry.id)) {
    failures.push(`baseline lists ${entry.id} twice; one entry per advisory`);
  }
  seenIds.add(entry.id);
  if (entry.versions && !Array.isArray(entry.versions)) {
    failures.push(`baseline entry ${entry.name} has a non-array \`versions\` field`);
  }
}

/** Run a bun subcommand and return its stdout, or throw with a useful message. */
function bun(args) {
  try {
    return execFileSync("bun", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (error) {
    // `bun audit` exits non-zero when it finds something, so a failure is a
    // real error only when no JSON came back.
    const raw = error.stdout?.toString() ?? "";
    if (raw.trim().startsWith("{")) return raw;
    throw new Error(error.stderr?.toString().trim() || error.message);
  }
}

let audit;
try {
  const raw = bun(["audit", "--json"]);
  audit = JSON.parse(raw.trim() === "" ? "{}" : raw);
} catch (error) {
  console.error(`audit-gate: bun audit failed to run: ${error.message}`);
  process.exit(2);
}

/** Every installed version of every package, from `bun pm ls --all`. */
function installedVersions() {
  const versions = new Map();
  let listing;
  try {
    listing = bun(["pm", "ls", "--all"]);
  } catch (error) {
    console.error(`audit-gate: bun pm ls failed to run: ${error.message}`);
    process.exit(2);
  }
  for (const match of listing.matchAll(/([A-Za-z0-9@._/-]+)@(\d[^\s,()]*)/g)) {
    const [, name, version] = match;
    if (!versions.has(name)) versions.set(name, new Set());
    versions.get(name).add(version);
  }
  return versions;
}

const installed = installedVersions();

// bun audit answers `{ "<package>": [ { id, url, title, severity, vulnerable_versions } ] }`.
const reported = [];
for (const [name, advisories] of Object.entries(audit)) {
  if (!Array.isArray(advisories)) continue;
  for (const advisory of advisories) {
    if (!BLOCKING_SEVERITIES.has(String(advisory.severity))) continue;
    reported.push({
      name,
      id: String(advisory.url ?? "").match(GHSA)?.[0] ?? null,
      title: advisory.title ?? "no title",
      range: advisory.vulnerable_versions ?? advisory.range ?? "unknown range",
      severity: advisory.severity,
    });
  }
}

for (const finding of reported) {
  const match = accepted.find(
    (entry) => entry.name === finding.name && finding.id && entry.id === finding.id,
  );
  if (!match) {
    failures.push(
      `new ${finding.severity} advisory: ${finding.name} (${finding.id ?? "unidentified advisory"}) ${finding.range} -- ${finding.title}`,
    );
    continue;
  }
  // An accepted advisory is accepted for one range. A moved range means the
  // exemption no longer describes what is installed.
  if (match.range !== finding.range) {
    failures.push(
      `accepted ${finding.name} ${finding.id} now reports range ${finding.range}, baseline recorded ${match.range} -- re-check the exemption`,
    );
    continue;
  }
  // The exemption covers the versions the baseline names. Any other installed
  // copy is ours to fix.
  if (match.versions) {
    const unapproved = [...(installed.get(finding.name) ?? [])].filter(
      (version) => !match.versions.includes(version),
    );
    if (unapproved.length) {
      failures.push(
        `accepted ${finding.name} ${finding.id} is installed at unapproved version(s): ${unapproved.join(", ")} -- fix that copy (bun update ${finding.name}), or add the version with a reason`,
      );
      continue;
    }
  }
  notes.push(
    `accepted: ${finding.name} ${finding.id} (${finding.range}) -- ${match.reason}`,
  );
}

// Anything baselined that no longer reports as blocking must be removed, or
// the baseline becomes a permanent blanket exemption. Advisory-level, and
// blocking-level: an accepted high advisory that has been downgraded to
// moderate no longer blocks, so its entry is stale too.
const blockingIds = new Set(reported.map((finding) => finding.id).filter(Boolean));
for (const entry of accepted) {
  if (!entry.id) continue; // already failed above
  if (!blockingIds.has(entry.id)) {
    failures.push(
      `baseline entry ${entry.id} (${entry.name}) no longer reports as high/critical -- remove it from ${path.basename(baselinePath)}`,
    );
  }
}

if (failures.length) {
  console.error("Dependency audit gate FAILED");
  for (const message of failures) console.error(`- ${message}`);
  if (notes.length) {
    console.error("");
    for (const note of notes) console.error(`  (${note})`);
  }
  process.exit(1);
}

console.log(`Dependency audit gate OK: ${reported.length} blocking finding(s), all baselined`);
for (const note of notes) console.log(`- ${note}`);
