#!/usr/bin/env node
// File-size gate.
//
// AGENTS.md sets the convention: "split files exceeding ~450 lines along domain
// boundaries". Until now nothing enforced it, so the corpus grew 15 modules
// past the limit (wave-2 architecture inventory measured 14 on c039639;
// session-lifecycle and bash-mode/completion crossed since). A hard gate with
// no exceptions would force a flag-day refactor of all 15 before it could land,
// so this gate enforces the rule where it is cheap — at the boundary:
//
//   - a tracked .ts source file under src/, bash-mode/ or queue/ that exceeds
//     MAX_LINES and is not listed below fails — new violations are not allowed
//   - a grandfathered file may keep its size but not grow more than
//     GROWTH_TOLERANCE past the recorded baseline — the split is pending, not
//     cancelled
//   - a grandfathered file that drops to <= MAX_LINES makes its entry stale and
//     fails until the entry is removed — the allowlist must describe reality,
//     like audit-baseline.json, or it silently becomes a permanent exemption
//
// Run it directly (`node scripts/check-file-size.mjs`) or via
// `bun run file-size`. The CI lane is `file-size` in .github/workflows/test.yml.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const MAX_LINES = 450;
// A grandfathered file may drift at most 10% past its recorded baseline.
export const GROWTH_TOLERANCE = 1.1;

// Directories whose tracked .ts files the gate measures.
export const SCAN_DIRS = ["src", "bash-mode", "queue"];

// Known over-the-limit files, each pending a split (wave-2 arch-debt
// inventory, re-measured on the tree this gate was added to). The number is
// the recorded line count the growth ceiling is computed from. Do not add
// entries for new files — a new file over the limit should be split before it
// lands, not exempted.
export const GRANDFATHERED = new Map([
  // src/extension/settings/config-cli.ts — four CLI phases in one file; split pending.
  ["src/extension/settings/config-cli.ts", 722],
  // src/config/presets.ts — ~385-line PRESETS data table; presets-table.ts split pending.
  ["src/config/presets.ts", 572],
  // src/extension/skills/skill-registry.ts — discovery + usage ledger + body IO; split pending.
  ["src/extension/skills/skill-registry.ts", 557],
  // queue/store.ts — persistence class + normalizers + parsers; split pending.
  ["queue/store.ts", 555],
  // src/extension/skills/skill-manager.ts — one ~376-line overlay function; split pending.
  ["src/extension/skills/skill-manager.ts", 551],
  // src/extension/ui/deck/component.ts — deck component factory for all routes; split pending.
  ["src/extension/ui/deck/component.ts", 546],
  // src/extension/ui/menu-views.ts — five unrelated overlay views; split pending.
  ["src/extension/ui/menu-views.ts", 541],
  // src/config/types.ts — type-only file; split only when next touched.
  ["src/config/types.ts", 533],
  // src/extension/settings/config-diagnostics.ts — detector internals beside orchestrator; split pending.
  ["src/extension/settings/config-diagnostics.ts", 512],
  // src/extension/ui/deck/render.ts — frame + per-route bodies + private text utils; split pending.
  ["src/extension/ui/deck/render.ts", 494],
  // src/extension/session/session-lifecycle.ts — composition wiring; split only when next touched.
  ["src/extension/session/session-lifecycle.ts", 494],
  // src/extension/queue/queue-integration.ts — capture/delivery/pick/handoff mixed; split pending.
  ["src/extension/queue/queue-integration.ts", 474],
  // bash-mode/editor.ts — editor class + bracketed-paste handling; split pending.
  ["bash-mode/editor.ts", 470],
  // src/motion/catalog-extra.ts — intentional data wall; split only when next touched.
  ["src/motion/catalog-extra.ts", 453],
  // bash-mode/completion.ts — completion engine; split pending.
  ["bash-mode/completion.ts", 451],
]);

/** Line count the way `wc -l` reports it (trailing newline is a terminator). */
export function countLines(content) {
  if (content.length === 0) return 0;
  const lines = content.split("\n").length;
  return content.endsWith("\n") ? lines - 1 : lines;
}

/** Largest line count a grandfathered file may reach before it fails. */
export function growthCeiling(baseline) {
  return Math.floor(baseline * GROWTH_TOLERANCE);
}

/**
 * Evaluate measured file sizes against the limit.
 * `files` maps repo-relative paths to line counts (all scanned files, not only
 * the over-limit ones — the stale-entry check needs the under-limit ones too).
 * Returns { failures, notes } — a gate run fails when failures is non-empty.
 */
export function evaluateFileSizes({
  files,
  maxLines = MAX_LINES,
  grandfathered = GRANDFATHERED,
}) {
  const failures = [];
  const notes = [];
  for (const [file, lines] of [...files].sort()) {
    if (lines <= maxLines) continue;
    const baseline = grandfathered.get(file);
    if (baseline === undefined) {
      failures.push(
        `${file}: ${lines} lines exceeds the ${maxLines}-line module-size convention — ` +
          `split along domain boundaries (AGENTS.md); do not add new GRANDFATHERED entries`,
      );
      continue;
    }
    if (lines > baseline * GROWTH_TOLERANCE) {
      failures.push(
        `${file}: ${lines} lines grew more than 10% past the recorded ${baseline} ` +
          `(ceiling ${growthCeiling(baseline)}) — the file is pending a split, not growth`,
      );
    } else if (lines > baseline) {
      notes.push(
        `${file}: ${lines} lines (recorded ${baseline}, ceiling ${growthCeiling(baseline)}) — ` +
          `growing inside tolerance; the split is still pending`,
      );
    }
  }
  for (const [file, baseline] of [...grandfathered].sort()) {
    const lines = files.get(file);
    if (lines === undefined) {
      failures.push(
        `GRANDFATHERED entry ${file} (recorded ${baseline}) is gone or untracked — ` +
          `remove the entry so the list keeps describing reality`,
      );
    } else if (lines <= maxLines) {
      failures.push(
        `GRANDFATHERED entry ${file} is now ${lines} lines (<= ${maxLines}) — ` +
          `the split landed; remove the entry so it cannot regrow`,
      );
    }
  }
  return { failures, notes };
}

/** Tracked .ts files under the scan dirs, repo-relative. */
export function trackedSources(rootDir = root) {
  const out = execFileSync("git", ["ls-files", "--", ...SCAN_DIRS], {
    cwd: rootDir,
    encoding: "utf8",
  });
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter((file) => file.endsWith(".ts"));
}

/** Measure every tracked source file: repo-relative path -> line count. */
export function measureFiles(rootDir = root) {
  const files = new Map();
  for (const file of trackedSources(rootDir)) {
    files.set(file, countLines(readFileSync(path.join(rootDir, file), "utf8")));
  }
  return files;
}

export function runGate(rootDir = root) {
  const files = measureFiles(rootDir);
  const { failures, notes } = evaluateFileSizes({ files });
  const over = [...files.values()].filter((lines) => lines > MAX_LINES).length;
  return { files, failures, notes, over };
}

function isDirectEntrypoint() {
  if (!process.argv[1]) return false;
  return fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}

if (isDirectEntrypoint()) {
  let result;
  try {
    result = runGate();
  } catch (error) {
    console.error(`file-size gate: cannot measure the tree: ${error.message}`);
    process.exit(2);
  }
  const { files, failures, notes, over } = result;
  if (failures.length) {
    console.error("File-size gate FAILED");
    for (const message of failures) console.error(`- ${message}`);
    if (notes.length) {
      console.error("");
      for (const note of notes) console.error(`  (${note})`);
    }
    process.exit(1);
  }
  console.log(
    `File-size gate OK: ${files.size} tracked source files <= ${MAX_LINES} lines ` +
      `(${over} grandfathered, pending splits)`,
  );
  for (const note of notes) console.log(`- ${note}`);
}
