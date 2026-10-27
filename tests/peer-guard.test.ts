import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  PEER_FLOOR_VERSION,
  PEER_SYMBOL_REQUIREMENTS,
  checkPeerRuntime,
  findMissingPeerSymbols,
  formatPeerGuardNotice,
  formatPeerGuardWarning,
  maybeNotifyPeerGuard,
  requirePeerSymbol,
  resetPeerGuardNotice,
  type PeerPackage,
  type PeerSymbolRequirement,
} from "../src/extension/core/peer-guard.ts";

/**
 * The activation-time Pi SDK peer guard.
 *
 * `peerDependencies` must stay "*" (Pi's package contract), so the manifest
 * cannot express the real floor of this extension. These tests cover the three
 * halves of the guard:
 *
 * 1. the decision logic — which symbols count as missing, and what the operator
 *    is told;
 * 2. completeness — the guarded symbol list must match the runtime imports of
 *    every published source file exactly, in both directions, so a newly used
 *    SDK symbol cannot slip in unguarded and a stale entry cannot linger;
 * 3. the wiring — activation warns, session start notifies, and the `/vibe`
 *    call site fails with an actionable message instead of a TypeError.
 */

const root = join(import.meta.dirname, "..");

const requirement = (
  symbol: string,
  pkg: PeerPackage = "@earendil-works/pi-ai",
): PeerSymbolRequirement => ({
  pkg,
  symbol,
  usedBy: `feature for ${symbol}`,
});

function fakeNamespaces(
  present: PeerSymbolRequirement[],
): Partial<Record<PeerPackage, unknown>> {
  const byPkg: Partial<Record<PeerPackage, Record<string, unknown>>> = {};
  for (const { pkg, symbol } of present) {
    (byPkg[pkg] ??= {})[symbol] = () => symbol;
  }
  return byPkg;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Decision logic
// ═══════════════════════════════════════════════════════════════════════════

test("findMissingPeerSymbols passes when the whole symbol set is present", () => {
  const missing = findMissingPeerSymbols(fakeNamespaces(PEER_SYMBOL_REQUIREMENTS));
  assert.deepEqual(missing, []);
});

test("findMissingPeerSymbols names each absent symbol with its package and blast radius", () => {
  const missing = findMissingPeerSymbols(
    fakeNamespaces([requirement("presentSymbol")]),
    [
      requirement("presentSymbol"),
      requirement("missingOne"),
      requirement("missingTwo"),
    ],
  );
  assert.deepEqual(
    missing.map((m) => m.symbol),
    ["missingOne", "missingTwo"],
  );
  for (const entry of missing) {
    assert.equal(entry.pkg, "@earendil-works/pi-ai");
    assert.ok(entry.usedBy.includes(entry.symbol));
  }
});

test("symbols re-exported through a CJS interop default still count as present", () => {
  const namespaced: Partial<Record<PeerPackage, unknown>> = {
    "@earendil-works/pi-ai": { default: { normalizeContext: () => undefined } },
  };
  const missing = findMissingPeerSymbols(namespaced, [
    requirement("normalizeContext"),
  ]);
  assert.deepEqual(missing, []);
});

test("an unloadable peer namespace is reported, not crashed on", () => {
  const missing = findMissingPeerSymbols(
    { "@earendil-works/pi-ai": undefined },
    [requirement("normalizeContext")],
  );
  assert.deepEqual(
    missing.map((m) => m.symbol),
    ["normalizeContext"],
  );
  // A null or primitive namespace must be equally survivable.
  for (const ns of [null, 42, "nope"]) {
    const result = findMissingPeerSymbols(
      { "@earendil-works/pi-ai": ns },
      [requirement("normalizeContext")],
    );
    assert.equal(result.length, 1);
  }
});

test("the warning names the floor, every missing symbol and its feature", () => {
  const missing = [
    requirement("normalizeContext"),
    requirement("loadSkills", "@earendil-works/pi-coding-agent"),
  ];
  const warning = formatPeerGuardWarning(missing);
  assert.ok(warning.includes(PEER_FLOOR_VERSION), "mentions the version floor");
  for (const entry of missing) {
    assert.ok(warning.includes(entry.symbol), `names ${entry.symbol}`);
    assert.ok(warning.includes(entry.usedBy), `names ${entry.usedBy} blast radius`);
    assert.ok(warning.includes(entry.pkg), `names ${entry.pkg}`);
  }
  assert.ok(/upgrade/i.test(warning), "tells the operator what to do");
  // Singular/plural must not read as "1 symbols".
  assert.ok(
    /2 imported symbols are missing/.test(warning),
    "plural form is grammatical",
  );
  const single = formatPeerGuardWarning([requirement("onlyOne")]);
  assert.ok(/1 imported symbol is missing/.test(single), "singular form too");
});

test("the UI notice is a single actionable line", () => {
  const notice = formatPeerGuardNotice([
    requirement("normalizeContext"),
    requirement("loadSkills", "@earendil-works/pi-coding-agent"),
  ]);
  assert.ok(notice.includes(PEER_FLOOR_VERSION));
  assert.ok(notice.includes("normalizeContext"));
  assert.ok(notice.includes("loadSkills"));
  assert.ok(!notice.includes("\n"), "fits a toast");
});

test("requirePeerSymbol passes values through and throws an actionable error when missing", () => {
  const fn = () => "value";
  assert.equal(requirePeerSymbol(fn, "normalizeContext"), fn);

  for (const absent of [undefined, null]) {
    assert.throws(
      () => requirePeerSymbol(absent, "normalizeContext"),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.ok(
          error.message.includes("normalizeContext"),
          "names the symbol",
        );
        assert.ok(error.message.includes(PEER_FLOOR_VERSION), "names the floor");
        assert.ok(error.message.includes("@earendil-works/pi-ai"), "names the package");
        assert.ok(error.message.includes("/vibe"), "names the feature");
        return true;
      },
      `${String(absent)} must be rejected`,
    );
  }
});

test("the guard's error stays useful for symbols outside the catalog", () => {
  // Reached through requirePeerSymbol, the only caller: an unknown symbol
  // still has to name itself and the floor.
  const error = (() => {
    try {
      requirePeerSymbol(undefined, "totallyUnknownSymbol");
      return new Error("expected a throw");
    } catch (e) {
      return e as Error;
    }
  })();
  assert.ok(error.message.includes("totallyUnknownSymbol"));
  assert.ok(error.message.includes(PEER_FLOOR_VERSION));
});

test("the live peers this process loaded satisfy the full symbol set", () => {
  // The guard's own catalog must be resolvable against the pinned dev
  // dependencies — otherwise the catalog is fiction.
  assert.deepEqual(checkPeerRuntime(), []);
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Completeness: catalog ⇄ published imports, both directions
// ═══════════════════════════════════════════════════════════════════════════

const PEER_PACKAGES: readonly PeerPackage[] = [
  "@earendil-works/pi-ai",
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-tui",
];

function publishedSourceFiles(): string[] {
  const files: string[] = [];
  for (const dir of ["src", "bash-mode", "queue"]) {
    const base = join(root, dir);
    for (const entry of readdirSync(base, { recursive: true })) {
      const rel = String(entry);
      if (rel.endsWith(".ts") && !rel.endsWith(".d.ts")) {
        files.push(join(base, rel));
      }
    }
  }
  for (const file of ["index.ts"]) {
    files.push(join(root, file));
  }
  return files;
}

/** Runtime (non-type) named imports from the peer packages, per file. */
function runtimePeerImports(source: string): Array<{
  pkg: PeerPackage;
  symbol: string;
}> {
  const found: Array<{ pkg: PeerPackage; symbol: string }> = [];
  // `[^;]` keeps one match inside one import statement: a lazy clause that
  // may cross a `;` would swallow earlier imports (node:fs, node:path, …) and
  // attribute their symbols to the peer package of the later statement.
  const stmt = /import\s+([^;]*?)\s*from\s+"(@earendil-works\/[^"]+)"/g;
  for (const match of source.matchAll(stmt)) {
    const clause = match[1];
    const pkg = match[2] as PeerPackage;
    if (!PEER_PACKAGES.includes(pkg)) continue;
    if (clause.startsWith("type ")) continue; // import type { ... } is erased
    const brace = clause.match(/\{([\s\S]*)\}/);
    if (!brace) continue; // default/namespace imports carry no per-symbol risk
    for (const raw of brace[1].split(",")) {
      const spec = raw.trim();
      if (!spec || spec.startsWith("type ")) continue; // inline `type X`
      const name = spec.split(/\s+as\s+/)[0].trim();
      if (name) found.push({ pkg, symbol: name });
    }
  }
  return found;
}

test("every runtime peer import in published code is guarded", () => {
  const unguarded: string[] = [];
  for (const file of publishedSourceFiles()) {
    for (const { pkg, symbol } of runtimePeerImports(readFileSync(file, "utf8"))) {
      const covered = PEER_SYMBOL_REQUIREMENTS.some(
        (r) => r.pkg === pkg && r.symbol === symbol,
      );
      if (!covered) {
        unguarded.push(`${symbol} (${pkg}) — ${file.replace(root, ".")}`);
      }
    }
  }
  assert.deepEqual(
    unguarded,
    [],
    "these SDK symbols are used but absent from PEER_SYMBOL_REQUIREMENTS",
  );
});

test("every guarded symbol is actually imported somewhere (no stale entries)", () => {
  const used = new Set<string>();
  for (const file of publishedSourceFiles()) {
    for (const { pkg, symbol } of runtimePeerImports(readFileSync(file, "utf8"))) {
      used.add(`${pkg}:${symbol}`);
    }
  }
  const stale = PEER_SYMBOL_REQUIREMENTS.filter(
    (r) => !used.has(`${r.pkg}:${r.symbol}`),
  ).map((r) => `${r.symbol} (${r.pkg})`);
  assert.deepEqual(stale, [], "guarded symbols nothing imports anymore");
});

test("the completeness scan itself detects drift (not vacuous)", () => {
  // Sanity-check the scanner against handcrafted sources so a broken regex
  // cannot make the two tests above pass by finding nothing.
  const source = [
    'import { matchesKey, type KeyId } from "@earendil-works/pi-tui";',
    'import type { Theme } from "@earendil-works/pi-coding-agent";',
    'import {',
    '  CustomEditor,',
    '  type KeybindingsManager,',
    '} from "@earendil-works/pi-coding-agent";',
    'import { normalizeContext } from "@earendil-works/pi-ai";',
  ].join("\n");
  const found = runtimePeerImports(source);
  assert.deepEqual(
    found.map((f) => f.symbol).sort(),
    ["CustomEditor", "matchesKey", "normalizeContext"],
    "type-only imports must not count as runtime symbols",
  );
});

test("the guarded catalog has no duplicate entries", () => {
  const seen = new Set<string>();
  for (const r of PEER_SYMBOL_REQUIREMENTS) {
    const key = `${r.pkg}:${r.symbol}`;
    assert.ok(!seen.has(key), `duplicate requirement: ${key}`);
    seen.add(key);
    assert.ok(r.usedBy.trim().length > 0, `${key} needs a blast-radius label`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Wiring
// ═══════════════════════════════════════════════════════════════════════════

function fakeUi() {
  const notices: Array<{ message: string; level: string }> = [];
  return {
    notices,
    ctx: {
      hasUI: true,
      ui: {
        notify(message: string, level: string) {
          notices.push({ message, level });
        },
      },
    },
  };
}

test("session start notifies once about missing symbols, then stays quiet", () => {
  resetPeerGuardNotice();
  const missing = [requirement("normalizeContext")];
  const { notices, ctx } = fakeUi();

  maybeNotifyPeerGuard(ctx, () => missing);
  maybeNotifyPeerGuard(ctx, () => missing);
  maybeNotifyPeerGuard(ctx, () => missing);

  assert.equal(notices.length, 1, "warned exactly once");
  assert.equal(notices[0].level, "warning");
  assert.ok(notices[0].message.includes("normalizeContext"));
});

test("no notification when the SDK is complete or no UI is available", () => {
  resetPeerGuardNotice();
  const missing = [requirement("normalizeContext")];
  const { notices, ctx } = fakeUi();

  maybeNotifyPeerGuard(ctx, () => []);
  assert.equal(notices.length, 0, "complete SDK stays silent");

  maybeNotifyPeerGuard({ hasUI: false, ui: ctx.ui }, () => missing);
  assert.equal(notices.length, 0, "headless context stays silent");

  maybeNotifyPeerGuard(undefined, () => missing);
  assert.equal(notices.length, 0, "missing context stays silent");

  maybeNotifyPeerGuard({ hasUI: true }, () => missing);
  assert.equal(notices.length, 0, "UI without notify() stays silent");
});

test("activation warns to the console for a below-floor SDK", () => {
  const source = readFileSync(
    join(root, "src", "extension", "session", "activate.ts"),
    "utf8",
  );
  assert.ok(
    source.includes("checkPeerRuntime()"),
    "activate.ts must run the peer check",
  );
  assert.ok(
    source.includes("formatPeerGuardWarning"),
    "activate.ts must format the warning",
  );
});

test("the /vibe call site fails with the guard's message, not a TypeError", () => {
  const source = readFileSync(
    join(root, "src", "working-vibes", "provider.ts"),
    "utf8",
  );
  assert.ok(
    source.includes('requirePeerSymbol(normalizeContext, "normalizeContext")'),
    "provider.ts must guard normalizeContext at the call site",
  );
});

test("session lifecycle surfaces the warning through the UI", () => {
  const source = readFileSync(
    join(root, "src", "extension", "session", "session-lifecycle.ts"),
    "utf8",
  );
  assert.ok(
    source.includes("maybeNotifyPeerGuard(ctx)"),
    "session-lifecycle.ts must notify the operator at session start",
  );
});
