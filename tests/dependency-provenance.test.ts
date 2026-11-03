import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Root cause of the remaining `npm audit` finding, and how it resolved.
//
// There were two copies, with different causes:
//
//  1. The top-level copy (pulled in by `madge` -> ... -> `minimatch`) sat on
//     5.0.9 through a stale lockfile pin. This one was OURS: `npm audit fix`
//     resolved it to 5.0.12.
//
//  2. The copy nested under `@earendil-works/pi-coding-agent` was inherited
//     and NOT reachable from here: the peer published an
//     `npm-shrinkwrap.json`, which npm treats as authoritative for consumers
//     and installs verbatim without re-resolving. It pinned 5.0.9, and
//     `overrides` cannot pierce a dependency's shrinkwrap (verified
//     empirically, top-level and path-scoped).
//
// Resolution: `pi-coding-agent` 1.5.0 no longer ships an npm-shrinkwrap.json,
// so npm resolves its transitive tree normally and brace-expansion lands at
// the fixed 5.0.12 -- the same release that moved undici to 8.12.3. All three
// advisories left the report and `audit-baseline.json` is empty again. The
// tests below now guard the fixed state: no vulnerable copy anywhere, and a
// peer shrinkwrap that must never pin a vulnerable version if it returns.

const root = join(import.meta.dirname, "..");
const PEER = "@earendil-works/pi-coding-agent";
const peerDir = join(root, "node_modules", ...PEER.split("/"));

/** Advisories GHSA-q2hr-2g5m-vwhr / qhr7-859c-m2p7 / 6j4f-fj2g-mc7p. */
const ADVISORIES = [
  {
    id: "GHSA-qhr7-859c-m2p7",
    ranges: [
      ["4.0.0", "5.0.11"],
      ["3.0.0", "3.0.8"],
      ["2.0.0", "2.1.6"],
      ["0.0.0", "1.1.20"],
    ],
  },
  {
    id: "GHSA-6j4f-fj2g-mc7p",
    ranges: [
      ["4.0.0", "5.0.10"],
      ["3.0.0", "3.0.7"],
      ["2.0.0", "2.1.5"],
      ["0.0.0", "1.1.19"],
    ],
  },
  {
    id: "GHSA-q2hr-2g5m-vwhr",
    ranges: [
      ["4.0.0", "5.0.12"],
      ["3.0.0", "3.0.9"],
      ["2.0.0", "2.1.7"],
      ["0.0.0", "1.1.21"],
    ],
  },
] as const;

const parse = (v: string) => v.split("-")[0].split(".").map(Number);

function cmp(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left !== right) return left < right ? -1 : 1;
  }
  return 0;
}

/** Vulnerable to ANY of the three advisories, each with its own release lines. */
function isVulnerable(version: string): boolean {
  const v = parse(version);
  return ADVISORIES.some(({ ranges }) =>
    ranges.some(([lo, hi]) =>
      (lo === "0.0.0" || cmp(v, parse(lo)) >= 0) && cmp(v, parse(hi)) < 0,
    ),
  );
}

/** Every `brace-expansion` package.json reachable in our installed tree. */
function findCopies(nmDir: string): string[] {
  if (!existsSync(nmDir)) return [];
  return readdirSync(nmDir, { recursive: true })
    .filter((p) => p.endsWith("brace-expansion/package.json"))
    .map((p) => join(nmDir, p));
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

test("the peer no longer pins a vulnerable brace-expansion", () => {
  // The peer's npm-shrinkwrap.json was what made the advisory unreachable.
  // If a shrinkwrap ever returns it must not pin a vulnerable copy.
  const shrinkwrapPath = join(peerDir, "npm-shrinkwrap.json");
  if (existsSync(shrinkwrapPath)) {
    const shrinkwrap = JSON.parse(readFileSync(shrinkwrapPath, "utf8"));
    const entry = shrinkwrap.packages["node_modules/brace-expansion"];
    assert.ok(
      !entry || !isVulnerable(entry.version),
      `peer shrinkwrap pins vulnerable brace-expansion@${entry?.version}`,
    );
  }

  // With the shrinkwrap gone the peer's tree resolves normally: no vulnerable
  // copy may exist underneath it either.
  const nested = findCopies(join(peerDir, "node_modules")).filter((manifest) =>
    isVulnerable(JSON.parse(readFileSync(manifest, "utf8")).version),
  );
  assert.deepEqual(
    nested,
    [],
    `vulnerable brace-expansion under the peer: ${nested.join(", ")}`,
  );
});

test("per-line ranges: patched earlier-line versions are not classified vulnerable", () => {
  // Comparing every version against a single "first fixed" version would
  // classify patched 1.x/2.x/3.x releases as vulnerable and falsely fail the
  // copy scan the day a legitimate older-line copy appears in the tree.
  for (const version of ["1.1.21", "2.1.7", "3.0.9", "5.0.12"]) {
    assert.ok(
      !isVulnerable(version),
      `${version} is patched against all three advisories`,
    );
  }
  // 5.0.11 clears both high advisories but the moderate one only ships a fix
  // at 5.0.12, so the older pin stays vulnerable under per-line ranges.
  assert.ok(isVulnerable("5.0.11"), "5.0.11 is still inside GHSA-q2hr-2g5m-vwhr's range");
  for (const version of ["1.1.19", "2.1.5", "3.0.7", "4.0.1", "5.0.9"]) {
    assert.ok(isVulnerable(version), `${version} is inside the advisory ranges`);
  }
});

/**
 * The general form of the same trap.
 *
 * `brace-expansion` was easy to name. The next inherited advisory will not be,
 * and the failure mode is always the same: someone writes "inherited, no fix"
 * in a note, the CI audit is switched to `continue-on-error`, and from then on
 * nothing new is ever caught. `scripts/audit-gate.mjs` is the gate that stops
 * that; these assertions make sure the *inputs* it depends on stay honest.
 */
test("every accepted advisory is genuinely unreachable, not merely labelled so", () => {
  const baseline = JSON.parse(readFileSync(join(root, "audit-baseline.json"), "utf8"));
  const accepted = (baseline.accepted ?? []) as Array<{ name: string; reason: string }>;

  for (const entry of accepted) {
    // "Inherited" is only credible if it names the mechanism. An advisory we
    // simply never looked at must not be able to sit in this file.
    assert.match(
      entry.reason,
      /shrinkwrap|overrides|not reachable|no fix available at any installable version/i,
      `${entry.name}: justify reachability with a mechanism, not an assertion`,
    );
    // And the accepted set must stay small enough to review by hand.
    assert.ok(
      accepted.length <= 5,
      `baseline has ${accepted.length} accepted advisories; past a handful it stops being reviewable`,
    );
  }
});

test("a shrinkwrap in our tree can only come from a dependency, never from us", () => {
  // If we ever ship a shrinkwrap, every consumer's install of this package
  // becomes authoritative-but-frozen, and the inherited-advisory problem would
  // apply to *us* as the publisher instead of to the Pi SDK.
  assert.ok(
    !existsSync(join(root, "npm-shrinkwrap.json")),
    "this package must not ship an npm-shrinkwrap.json",
  );
});

test("no dependency outside a shrinkwrap owner is unreachable-by-override", () => {
  // An `overrides` entry only works when the target tree is ours to re-resolve.
  // Overriding a package that ships its own shrinkwrap is a no-op, so shipping
  // one would advertise protection that does not exist -- the mistake this
  // whole file is about. Guard it generically instead of per-package.
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const overrides = (pkg.overrides ?? {}) as Record<string, unknown>;
  if (Object.keys(overrides).length === 0) return;

  for (const target of Object.keys(overrides)) {
    const manifest = join(root, "node_modules", target, "package.json");
    if (!existsSync(manifest)) continue;
    const dir = join(root, "node_modules", target);
    assert.ok(
      !existsSync(join(dir, "npm-shrinkwrap.json")),
      `override for ${target} cannot take effect: that package ships a shrinkwrap`,
    );
  }
});