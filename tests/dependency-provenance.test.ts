import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Root cause of the remaining `npm audit` finding.
//
// There are two copies, and they have different causes:
//
//  1. The top-level copy (pulled in by `madge` -> ... -> `minimatch`) sat on
//     5.0.9 through a stale lockfile pin. This one is OURS: `npm audit fix`
//     resolves it to 5.0.12. Keeping it pinned below the fix is our bug, not
//     an inherited one.
//
//  2. The copy nested under `@earendil-works/pi-coding-agent` is inherited
//     and NOT reachable from here. The peer publishes an
//     `npm-shrinkwrap.json`, which is authoritative for consumers: npm
//     installs the peer's pinned tree verbatim and never re-resolves it. The
//     peer pins 5.0.9.
//
// The important part is what the second one is NOT: it is not "no fix
// available". `brace-expansion@5.0.12` exists and satisfies the `^5.0.8` range
// the peer's own `minimatch` declares, so the peer can fix this with a
// lockfile bump alone -- no API change. An earlier CHANGELOG entry claimed
// otherwise; that claim was wrong. It is also not fixable from here:
// `overrides` in our package.json do not reach into a dependency's shrinkwrap.
// Verified empirically -- both a top-level `"brace-expansion": "^5.0.12"` and
// a path-scoped
// `"@earendil-works/pi-coding-agent": { "brace-expansion": "^5.0.12" }` left
// the nested copy at 5.0.9.
//
// So: fix what is ours, and describe the rest accurately.

const root = join(import.meta.dirname, "..");
const PEER = "@earendil-works/pi-coding-agent";
const peerDir = join(root, "node_modules", ...PEER.split("/"));

/** Advisories GHSA-q2hr-2g5m-vwhr / qhr7-859c-m2p7 / 6j4f-fj2g-mc7p. */
const FIRST_FIXED = "5.0.12";

function isVulnerable(version: string): boolean {
  const parse = (v: string) => v.split("-")[0].split(".").map(Number);
  const fixed = parse(FIRST_FIXED);
  const parts = parse(version);
  for (let i = 0; i < fixed.length; i++) {
    const a = parts[i] ?? 0;
    if (a !== fixed[i]) return a < fixed[i];
  }
  return false;
}

/** Every `brace-expansion` package.json reachable in our installed tree. */
function findCopies(nmDir: string, acc: string[] = []): string[] {
  if (!existsSync(nmDir)) return acc;
  const visit = (pkgDir: string) => {
    const manifest = join(pkgDir, "package.json");
    if (existsSync(manifest)) {
      const pkg = JSON.parse(readFileSync(manifest, "utf8"));
      if (pkg.name === "brace-expansion") acc.push(manifest);
    }
    findCopies(join(pkgDir, "node_modules"), acc);
  };
  for (const entry of readdirSync(nmDir)) {
    if (entry === ".bin") continue;
    const child = join(nmDir, entry);
    if (!statSync(child).isDirectory()) continue;
    if (entry.startsWith("@")) {
      for (const scoped of readdirSync(child)) {
        visit(join(child, scoped));
      }
      continue;
    }
    visit(child);
  }
  return acc;
}

test("no vulnerable brace-expansion copy exists outside the peer's shrinkwrap", () => {
  const copies = findCopies(join(root, "node_modules"));
  assert.ok(copies.length > 0, "expected to find brace-expansion in the tree");

  const vulnerable = copies.filter((manifest) => {
    const version = JSON.parse(readFileSync(manifest, "utf8")).version;
    return isVulnerable(version);
  });

  // Every vulnerable copy must live underneath the peer, which owns the
  // shrinkwrap. Anything else -- including our own top-level entry -- is ours
  // to fix, and `npm audit fix` can.
  for (const manifest of vulnerable) {
    assert.ok(
      manifest.startsWith(peerDir),
      `vulnerable brace-expansion outside the peer tree: ${manifest} -- run \`npm audit fix\``,
    );
  }
});

test("the remaining advisory is inherited, not introduced by us", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

  // We declare no direct dependency on it.
  for (const field of ["dependencies", "devDependencies"] as const) {
    assert.ok(
      !(field in pkg) || !(pkg[field] as Record<string, string>)["brace-expansion"],
      `brace-expansion must not be a direct ${field} entry`,
    );
  }

  // And we carry no override that silently pretends to fix it: an override
  // cannot reach a dependency's shrinkwrap, so shipping one would be a false
  // guarantee. If a future npm lets overrides pierce shrinkwraps, delete this
  // assertion deliberately rather than by accident.
  assert.ok(
    !pkg.overrides || !pkg.overrides["brace-expansion"],
    "unreachable brace-expansion override present -- verify npm override semantics before keeping it",
  );
});

test("the peer pins a vulnerable brace-expansion via its published shrinkwrap", () => {
  const shrinkwrapPath = join(peerDir, "npm-shrinkwrap.json");
  assert.ok(
    existsSync(shrinkwrapPath),
    "peer no longer ships npm-shrinkwrap.json -- re-check the brace-expansion audit finding",
  );

  const shrinkwrap = JSON.parse(readFileSync(shrinkwrapPath, "utf8"));
  const entry = shrinkwrap.packages["node_modules/brace-expansion"];
  assert.ok(entry, "shrinkwrap no longer pins brace-expansion");
  assert.ok(
    isVulnerable(entry.version),
    `peer now pins brace-expansion@${entry.version}, which is outside the advisory range -- the audit finding should be gone; update the CHANGELOG`,
  );

  // The pin is self-imposed: the range the peer's own minimatch declares
  // already admits a fixed version, so this is a lockfile bump, not a breaking
  // change. That is what makes it an upstream bug report rather than a
  // permanent exemption.
  const range = shrinkwrap.packages["node_modules/minimatch"]?.dependencies?.[
    "brace-expansion"
  ];
  assert.equal(range, "^5.0.8");
  const floor = range.replace(/^[^\d]*/, "");
  assert.ok(
    isVulnerable(floor),
    `the declared floor ${floor} is already fixed -- the peer's range no longer explains the pin`,
  );
  assert.ok(
    !isVulnerable(FIRST_FIXED),
    "sanity: the first fixed version must compare as not-vulnerable",
  );
});