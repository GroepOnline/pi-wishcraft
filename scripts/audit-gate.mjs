// Dependency audit gate.
//
// `npm audit --audit-level=high` alone cannot be the gate here: the one
// remaining finding is unreachable, so the step would stay red forever and CI
// would either ignore it (which also ignores every *new* finding) or block
// every release. Neither is acceptable.
//
// So this script audits against an explicit baseline of accepted advisories:
//
//   - every accepted entry names one advisory by its GHSA id and the install
//     path(s) the exemption covers, so a NEW high/critical advisory or a
//     second vulnerable copy on an already-accepted package still fails
//   - a high/critical finding that is not baselined fails the build
//   - a baselined advisory that no longer reports as blocking fails the build
//     too, because a stale baseline silently stops describing reality
//   - every accepted advisory carries a written justification, so "inherited"
//     has to be argued for rather than asserted
//
// An `npm audit` that fails to run at all (registry down, config error) also
// fails the gate: an error envelope must never be read as "zero findings".
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
// "inherited, trust me" note this gate exists to prevent, and an entry without
// an id or an approved install path cannot tell a new advisory -- or a second
// vulnerable copy of the same package -- apart from the exempted one.
for (const entry of accepted) {
  if (!entry.name || !entry.reason || !entry.id || !(entry.nodes || []).length) {
    failures.push(
      `baseline entry ${JSON.stringify(entry.name)} needs a written reason, an advisory id (GHSA-…) and the install path(s) the exemption covers`,
    );
  }
}

// When this script itself is run by `npm run`, npm injects the project's
// config as `npm_config_*` env vars, and a nested `npm audit` rejects an
// inherited install-scripts policy with EALLOWSCRIPTS. Strip that one family
// so the nested audit sees the same input it would standalone; any failure it
// still hits surfaces through the error-envelope check below.
// ponytail: targeted strip, widen to a general npm_config filter if another
// config var starts breaking nested audits.
const auditEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => !key.startsWith("npm_config_allow_scripts"),
  ),
);

let audit;
try {
  audit = JSON.parse(execFileSync("npm", ["audit", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: auditEnv,
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

// npm audit answers with an `error` envelope (and exit 1) when it could not
// produce a report. Parsing that as an empty vulnerability set would let the
// gate pass while the audit never ran.
if (audit.error) {
  console.error(`audit-gate: npm audit failed to run: ${audit.error.summary || audit.error.code || "unknown error"}`);
  if (audit.error.detail) console.error(audit.error.detail);
  process.exit(2);
}

const reported = Object.values(audit.vulnerabilities || {})
  .filter((v) => BLOCKING_SEVERITIES.has(v.severity));

const GHSA = /GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/i;

/** The GHSA id of a `via` entry, or null when it is a package-name reference. */
function advisoryId(via) {
  if (via === null || typeof via !== "object") return null;
  return via.url?.match(GHSA)?.[0] ?? null;
}

/** Is this install path covered by one of the entry's approved paths? */
function nodeApproved(approved, node) {
  return approved.some(
    (p) => node === p || node.startsWith(`${p}/`),
  );
}

for (const vuln of reported) {
  const advisories = (vuln.via || []).filter((v) => typeof v === "object");
  const acceptedForName = accepted.filter((e) => e.name === vuln.name);

  if (advisories.length === 0) {
    // Transitive-only entry (`via` lists package names): the real advisories
    // live on the direct entry, so a name-level exemption is all that makes
    // sense here.
    if (!acceptedForName.length) {
      failures.push(
        `new ${vuln.severity} advisory: ${vuln.name}@${vuln.range} (${vuln.nodes?.join(", ") || "unknown path"})`,
      );
    }
    continue;
  }

  // Match at the advisory level: an accepted package does not cover a new
  // advisory against that same package.
  for (const adv of advisories.filter((v) => BLOCKING_SEVERITIES.has(v.severity))) {
    const id = advisoryId(adv);
    const match = id ? acceptedForName.find((e) => e.id === id) : undefined;
    if (!match) {
      failures.push(
        `new ${adv.severity} advisory: ${vuln.name} (${id ?? "unidentified advisory"}) ${adv.range ?? vuln.range} -- ${adv.title ?? "no title"}`,
      );
      continue;
    }
    // npm groups findings by package name, so an accepted advisory also
    // covers any other copy of that package. The exemption is only for the
    // install path(s) the baseline lists: a second vulnerable copy is ours.
    const unapproved = (vuln.nodes || []).filter((n) => !nodeApproved(match.nodes || [], n));
    if (unapproved.length) {
      failures.push(
        `accepted ${vuln.name} ${id} reports an unapproved affected node: ${unapproved.join(", ")} -- fix that copy (npm audit fix), or add its path with a reason`,
      );
      continue;
    }
    // A baselined advisory whose range has moved is still the same advisory,
    // but the recorded range is stale and should be re-checked by a human.
    if (match.range && adv.range && match.range !== adv.range) {
      notes.push(`baseline range for ${vuln.name} ${id} is stale: recorded ${match.range}, now ${adv.range}`);
    }
    notes.push(`accepted: ${vuln.name} ${id} (${adv.range}) at ${(vuln.nodes || []).join(", ")} -- ${match.reason}`);
  }
}

// Anything baselined that no longer reports as blocking must be removed, or
// the baseline becomes a permanent blanket exemption. Advisory-level, and
// blocking-level: an accepted high advisory that has been downgraded to
// moderate no longer blocks, so its entry is stale too.
const blockingIds = new Set(
  reported.flatMap((v) =>
    (v.via || [])
      .filter((via) => typeof via === "object" && BLOCKING_SEVERITIES.has(via.severity))
      .map(advisoryId),
  ).filter(Boolean),
);
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
