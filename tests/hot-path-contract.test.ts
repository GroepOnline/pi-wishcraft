import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

/**
 * Structural guard for the hot-path contract in
 * `skills/wishcraft-hot-path-rules/SKILL.md`.
 *
 * The render loop repaints on a ~33ms debounce. Anything reachable from
 * `src/render/v2-entry.ts` that blocks the event loop — a sync process spawn,
 * an uncached sync read — can stall a frame, and the failure is invisible in
 * review because the offending call looks like an ordinary line of code in a
 * file about parsing `ss` output.
 *
 * These are import-graph assertions, so they cover indirect reachability too:
 * putting a blocking call behind three layers of helper modules still fails.
 */

const REPO_ROOT = resolve(import.meta.dirname, "..");
const RENDER_ENTRY = join(REPO_ROOT, "src/render/v2-entry.ts");

/** Modules under `src/` that make up the segment + overlay layer. */
const SYNC_PROCESS_FREE_DIRS = ["src/segments", "src/extension/ui"];

/** Sync calls that block the event loop. `exec`/`spawn` (async) are fine. */
const SYNC_PROCESS = /\b(execSync|spawnSync|execFileSync)\s*\(/g;

/** Sync filesystem calls. Legitimate only on an explicitly justified path. */
const SYNC_FS = /\b(readFileSync|readdirSync|statSync|writeFileSync|mkdirSync|unlinkSync|rmSync|renameSync|realpathSync)\s*\(/g;

// Matches the *specifier* of a static import/re-export, a bare side-effect
// import, and a dynamic `import()`. Deliberately anchored on `from` rather
// than on the `import` keyword: this codebase uses multi-line import clauses
// heavily, and a `[^;\n]*?` between the two silently drops every one of them
// — which makes the reachability assertions below pass vacuously.
const IMPORT_SPECIFIER =
  /\bfrom\s*["']([^"']+)["']|\bimport\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

/** Strip comments so prose that merely *names* a call doesn't trip the scan. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function sourceOf(file: string): string {
  return stripComments(readFileSync(file, "utf8"));
}

function localImports(file: string): string[] {
  const out: string[] = [];
  for (const match of sourceOf(file).matchAll(IMPORT_SPECIFIER)) {
    const spec = match[1] ?? match[2] ?? match[3];
    if (!spec || !spec.startsWith(".")) continue;
    const target = resolve(dirname(file), spec);
    if (existsSync(target)) out.push(target);
  }
  return out;
}

/** Every repo-relative module reachable from `entry` via relative imports. */
function reachableFrom(entry: string): Set<string> {
  const seen = new Set<string>([entry]);
  const queue = [entry];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const dep of localImports(current)) {
      if (seen.has(dep)) continue;
      seen.add(dep);
      queue.push(dep);
    }
  }
  return seen;
}

function matchesIn(file: string, pattern: RegExp): string[] {
  return [...new Set([...sourceOf(file).matchAll(pattern)].map((m) => m[1]!))].sort();
}

function filesUnder(dir: string): string[] {
  const absolute = join(REPO_ROOT, dir);
  if (!existsSync(absolute)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const full = join(absolute, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(relative(REPO_ROOT, full)));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Hard invariant: nothing on the paint path may spawn synchronously.
// ---------------------------------------------------------------------------

test("no module reachable from the status-line render entry spawns synchronously", () => {
  const offenders: string[] = [];
  for (const file of reachableFrom(RENDER_ENTRY)) {
    const calls = matchesIn(file, SYNC_PROCESS);
    if (calls.length > 0) {
      offenders.push(`  ${relative(REPO_ROOT, file)}: ${calls.join(", ")}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "the status line repaints every ~33ms; a sync spawn on this path stalls a frame.\n" +
      "Spawn asynchronously, serve the cached value, and repaint via a listener\n" +
      "(see src/git/status.ts and src/segments/ports.ts).\n" +
      offenders.join("\n"),
  );
});

test("the segment and overlay layer contains no sync spawns at all", () => {
  // Stricter than reachability: this covers code that is only reachable from
  // an entry point we have not wired up yet, plus future ones.
  const offenders: string[] = [];
  for (const dir of SYNC_PROCESS_FREE_DIRS) {
    for (const file of filesUnder(dir)) {
      const calls = matchesIn(file, SYNC_PROCESS);
      if (calls.length > 0) {
        offenders.push(`  ${relative(REPO_ROOT, file)}: ${calls.join(", ")}`);
      }
    }
  }
  assert.deepEqual(offenders, [], offenders.join("\n"));
});

// ---------------------------------------------------------------------------
// Sync filesystem reads are allowed, but only on a named, justified path.
// ---------------------------------------------------------------------------

/**
 * Each entry is a module that may touch the filesystem synchronously *because*
 * something async already scheduled it. Adding a name here is a claim that
 * the read cannot happen during a paint — keep that true or fix the call.
 */
const SYNC_FS_ALLOWLIST: Record<string, string> = {
  "src/theme/theme.ts":
    "theme.json resolution: mtime-identified so a user edit lands on the next paint; guarded by a TTL and memoised by getIcons()",
  "src/segments/ports-proc.ts":
    "/proc/net fallback: only ever reached from the async probe ladder in ports.ts, never from a segment render",
};

test("sync filesystem reads on the paint path are limited to a justified allowlist", () => {
  const offenders: string[] = [];
  for (const file of reachableFrom(RENDER_ENTRY)) {
    const calls = matchesIn(file, SYNC_FS);
    if (calls.length === 0) continue;
    const rel = relative(REPO_ROOT, file);
    if (!SYNC_FS_ALLOWLIST[rel]) {
      offenders.push(`  ${rel}: ${calls.join(", ")} (not in the allowlist — add it with a reason, or make the read async)`);
    }
  }
  assert.deepEqual(offenders, [], offenders.join("\n"));
});

test("every allowlisted sync-fs module still exists and is still justified", () => {
  // Catches the common rot: the justification is deleted from the code but
  // the allowlist entry is never revisited.
  for (const [rel, reason] of Object.entries(SYNC_FS_ALLOWLIST)) {
    assert.ok(existsSync(join(REPO_ROOT, rel)), `allowlisted module is gone: ${rel}`);
    assert.ok(
      reason.trim().length > 30,
      `allowlist entry for ${rel} needs a real justification, not a placeholder`,
    );
  }
});

test("the render entry itself is still the single paint chokepoint", () => {
  // If this file ever moves — or the import scanner regresses — the
  // reachability assertions above silently stop covering anything. These
  // specific modules must be on the graph or the guard is theatre.
  const reach = [...reachableFrom(RENDER_ENTRY)]
    .map((f) => relative(REPO_ROOT, f))
    .sort();
  for (const required of [
    "src/segments/registry.ts",
    "src/segments/system.ts",
    "src/segments/custom.ts",
    "src/segments/ports.ts",
    "src/theme/theme.ts",
  ]) {
    assert.ok(reach.includes(required), `render entry no longer reaches ${required} — update RENDER_ENTRY`);
  }
  assert.ok(
    reach.length > 50,
    `suspiciously small render graph (${reach.length} modules); the import scanner is probably missing edges`,
  );
});