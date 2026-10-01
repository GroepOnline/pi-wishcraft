// Dependency audit gate.
//
// `npm audit --audit-level=high` alone cannot be the gate here: the one
// remaining finding is unreachable, so the step would stay red forever and CI
// would either ignore it (which also ignores every *new* finding) or block
// every release. Neither is acceptable.
//
// So this script audits against an explicit baseline of accepted advisories:
//
//   - a high/critical finding that is NOT in the baseline fails the build
//   - a baselined advisory that no longer reports fails the build too, because
//     a stale baseline silently stops describing reality
//   - every accepted advisory carries a written justification, so "inherited"
//     has to be argued for rather than asserted
//
// Run it directly (`node scripts/audit-gate.mjs`) or via `npm run audit`.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const BLOCKING_SEVERITIES = new Set(["high", "critical"]);
const baselinePath = path.resolve(process.argv[2] || "audit-baseline.json");

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
// "inherited, trust me" note this gate exists to prevent.
for (const entry of accepted) {
  if (!entry.name || !entry.reason) {
    failures.push(`baseline entry ${JSON.stringify(entry.name)} needs a written reason`);
  }
}

let audit;
try {
  audit = JSON.parse(execFileSync("npm", ["audit", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }));
} catch (error) {
  // npm audit exits non-zero when it finds something, so a failure here is a
  // real error only when no JSON came back.
  const raw = error.stdout;
  if (!raw) {
    console.error(`audit-gate: npm audit failed to run: ${error.stderr?.toString().trim() || error.message}`);
    process.exit(2);
  }
  audit = JSON.parse(raw);
}

const reported = Object.values(audit.vulnerabilities || {})
  .filter((v) => BLOCKING_SEVERITIES.has(v.severity));

const key = (name) => `${name}`;

for (const vuln of reported) {
  const match = accepted.find((entry) => key(entry.name) === key(vuln.name));
  if (!match) {
    const via = (vuln.via || [])
      .map((v) => (typeof v === "string" ? v : v.title))
      .join("; ");
    failures.push(
      `new ${vuln.severity} advisory: ${vuln.name}@${vuln.range} (${vuln.nodes?.join(", ") || "unknown path"})${via ? ` -- ${via}` : ""}`,
    );
    continue;
  }
  // A baselined advisory whose range has moved is still the same advisory, but
  // the recorded range is stale and should be re-checked by a human.
  if (match.range && vuln.range && match.range !== vuln.range) {
    notes.push(`baseline range for ${vuln.name} is stale: recorded ${match.range}, now ${vuln.range}`);
  }
  notes.push(`accepted: ${vuln.name} (${vuln.range}) -- ${match.reason}`);
}

// Anything baselined that no longer reports must be removed, or the baseline
// becomes a permanent blanket exemption.
for (const entry of accepted) {
  if (!reported.some((v) => key(v.name) === key(entry.name))) {
    failures.push(
      `baseline entry ${entry.name} no longer reports -- remove it from ${path.basename(baselinePath)}`,
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