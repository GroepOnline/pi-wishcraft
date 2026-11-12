#!/usr/bin/env node
// Boundary audit — informational, not a gate.
//
// `bun run circular` (madge) proves the import graph is acyclic, but cycles are
// not the layering rule this repository is organized around. AGENTS.md makes
// src/extension/core/ the hub: "leaf modules consume and extend this hub but
// never import sibling leaves directly", and bash-mode/ + queue/ are declared
// standalone packages. The wave-2 architecture inventory found four violation
// classes that pass `bun run circular` untouched (measured on c039639):
//
//   §2a  leaf -> leaf        src/extension/<a> imports src/extension/<b>,
//                            a != b, bypassing the hub            (66 edges)
//   §2b  hub -> leaf         extension/core imports a leaf        ( 4 edges)
//   §2c  standalone -> src   bash-mode/ or queue/ imports src/    ( 3 edges)
//   §2d  src -> ext-leaf     a src/ domain imports an extension   ( 5 edges)
//                            leaf, the same coupling smell across
//                            the directory boundary
//
// This script re-measures those classes against the current tree and prints
// every edge, grouped so the aggregation hubs stand out. It exits 0 even when
// it finds violations: the inventory is paying-down debt, and gating on the
// absolute count would fail today. The file-size gate (check-file-size.mjs)
// and madge are the gates; this audit is the map for the cleanup lanes. If a
// class ever reaches zero, wiring `runAudit` into a gate is a one-line change.
//
// Sanctioned edges are not flagged: leaf -> core is the designed direction,
// index.ts is the package barrel, and external/node: specifiers never resolve
// into the corpus. `import type` / type-position `import("...")` edges are
// counted but marked [type] — they erase at runtime yet still couple modules.
//
// Run it directly (`node scripts/check-boundaries.mjs`) or via
// `bun run boundaries`. The CI lane is `boundaries` in .github/workflows/test.yml.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Top-level dirs whose tracked .ts files are scanned for import edges.
// index.ts is included: it is the package barrel and exempt by classification,
// but keeping it in the scan documents that exemption in the counts.
export const SCAN_TARGETS = ["src", "bash-mode", "queue", "index.ts"];

export const EXTENSION_ROOT = "src/extension/";
export const HUB_LEAF = "core";

// The wave-2 baseline counts measured on c039639, for drift comparison only.
export const VIOLATION_CLASSES = [
  {
    id: "leaf-to-leaf",
    section: "§2a",
    wave2: 66,
    label: "src/extension leaf importing a sibling leaf, bypassing extension/core",
  },
  {
    id: "hub-to-leaf",
    section: "§2b",
    wave2: 4,
    label: "src/extension/core (the hub) importing leaf internals",
  },
  {
    id: "standalone-to-src",
    section: "§2c",
    wave2: 3,
    label: "bash-mode/ or queue/ (declared standalone) importing src/",
  },
  {
    id: "src-to-extension-leaf",
    section: "§2d",
    wave2: 5,
    label: "a src/ domain importing an extension leaf",
  },
];

// Reported for context, not flagged: src/ domains leaning on the hub itself.
export const CONTEXT_CLASSES = [
  {
    id: "src-to-hub",
    label: "a src/ domain importing extension/core — the shared surface, listed for visibility",
  },
];

const SANCTIONED_CLASSES = new Set(["ok", "intra-leaf", "leaf-to-hub", "barrel"]);

/**
 * Extract import edges from one source file: [{ specifier, line, typeOnly }].
 *
 * Handles the three specifier shapes in this codebase: `from "..."` clauses on
 * import/export statements (including multiline import lists), bare
 * `import "..."` side-effect imports, and `import("...")` — which only appears
 * in type positions here, so it is marked typeOnly. `import type` / `export
 * type` statements mark their `from` clause typeOnly too, tracked across
 * multiline import lists by `typePending`. String literals shaped like
 * `from "./x.ts"` inside code would be a false positive — rare enough for an
 * audit tool that the readability is worth it (madge does the real parse).
 */
export function extractImportEdges(content) {
  const edges = [];
  let typePending = false;
  content.split("\n").forEach((line, index) => {
    if (/^\s*(?:import|export)\s+type\b/.test(line)) typePending = true;
    for (const match of line.matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
      edges.push({ specifier: match[1], line: index + 1, typeOnly: typePending });
      typePending = false;
    }
    for (const match of line.matchAll(/^\s*import\s+["']([^"']+)["']/g)) {
      edges.push({ specifier: match[1], line: index + 1, typeOnly: false });
    }
    for (const match of line.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) {
      edges.push({ specifier: match[1], line: index + 1, typeOnly: true });
    }
    // A `;` or `}` without a `from` clause ends a pending `import type` line.
    if (/[;}]/.test(line) && !/\bfrom\s+["']/.test(line)) typePending = false;
  });
  return edges;
}

/** Repo-relative import target, or null for external/node: specifiers. */
export function resolveSpecifier(importerPath, specifier) {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return null;
  const resolved = path.posix.normalize(
    path.posix.join(path.posix.dirname(importerPath), specifier),
  );
  if (resolved === ".." || resolved.startsWith("../")) return null;
  return resolved;
}

/** Extension leaf name for a path under src/extension/, else null. */
export function extensionLeaf(repoPath) {
  const match = /^src\/extension\/([^/]+)\//.exec(repoPath);
  return match ? match[1] : null;
}

/**
 * Classify one resolved edge into a violation class, a context class, or a
 * sanctioned bucket ("ok", "intra-leaf", "leaf-to-hub", "barrel").
 */
export function classifyEdge(importer, target) {
  const sourceLeaf = extensionLeaf(importer);
  const targetLeaf = extensionLeaf(target);

  // index.ts is the documented package barrel — it must reach the extension.
  if (importer === "index.ts") return "barrel";

  if (sourceLeaf && targetLeaf) {
    if (sourceLeaf === targetLeaf) return "intra-leaf";
    if (sourceLeaf === HUB_LEAF) return "hub-to-leaf";
    if (targetLeaf === HUB_LEAF) return "leaf-to-hub"; // designed direction
    return "leaf-to-leaf";
  }

  const standalone =
    importer.startsWith("bash-mode/") || importer.startsWith("queue/");
  if (standalone && target.startsWith("src/")) return "standalone-to-src";

  const srcDomain = importer.startsWith("src/") && !sourceLeaf;
  if (srcDomain && targetLeaf && targetLeaf !== HUB_LEAF) {
    return "src-to-extension-leaf";
  }
  if (srcDomain && targetLeaf === HUB_LEAF) return "src-to-hub";

  return "ok";
}

/**
 * Short area name for grouping: extension leaves collapse to `ext/<leaf>`,
 * src domains to `src/<domain>`, standalone dirs to themselves — so
 * `bash-mode -> ext/core` cannot be misread as the `queue/` leaf either.
 */
export function areaOf(repoPath) {
  const leaf = extensionLeaf(repoPath);
  if (leaf) return `ext/${leaf}`;
  const srcMatch = /^src\/([^/]+)\//.exec(repoPath);
  if (srcMatch) return `src/${srcMatch[1]}`;
  return repoPath.split("/")[0];
}

/**
 * Audit a corpus: `files` maps repo-relative paths to file content. Returns a
 * Map of class id -> [{ importer, line, target, typeOnly }] containing every
 * violation-class and context-class edge. Sanctioned edges are dropped.
 */
export function auditBoundaries(files) {
  const classes = new Map(
    [...VIOLATION_CLASSES, ...CONTEXT_CLASSES].map((entry) => [entry.id, []]),
  );
  for (const [importer, content] of [...files].sort()) {
    for (const edge of extractImportEdges(content)) {
      const target = resolveSpecifier(importer, edge.specifier);
      if (!target) continue;
      const classId = classifyEdge(importer, target);
      if (SANCTIONED_CLASSES.has(classId)) continue;
      classes.get(classId)?.push({
        importer,
        line: edge.line,
        target,
        typeOnly: edge.typeOnly,
      });
    }
  }
  return classes;
}

/** Tracked .ts files under the scan targets: repo-relative path -> content. */
export function readCorpus(rootDir = root) {
  const out = execFileSync("git", ["ls-files", "--", ...SCAN_TARGETS], {
    cwd: rootDir,
    encoding: "utf8",
  });
  const files = new Map();
  for (const file of out.split("\n").map((line) => line.trim())) {
    if (!file.endsWith(".ts")) continue;
    files.set(file, readFileSync(path.join(rootDir, file), "utf8"));
  }
  return files;
}

/** Group edges by "area -> area" pair, preserving first-seen order. */
export function groupByPair(edges) {
  const pairs = new Map();
  for (const edge of edges) {
    const key = `${areaOf(edge.importer)} -> ${areaOf(edge.target)}`;
    if (!pairs.has(key)) pairs.set(key, []);
    pairs.get(key).push(edge);
  }
  return pairs;
}

function runtimeOf(edges) {
  return edges.filter((edge) => !edge.typeOnly).length;
}

function printClass(entry, edges) {
  const runtime = runtimeOf(edges);
  const typeNote = edges.length - runtime > 0 ? ` (${runtime} runtime)` : "";
  const baseline =
    entry.wave2 === undefined ? "" : ` — wave-2 baseline @c039639: ${entry.wave2}`;
  console.log(`${entry.id}  [${entry.label}]`);
  console.log(`  ${edges.length} edges${typeNote}${baseline}`);
  for (const [pair, pairEdges] of groupByPair(edges)) {
    console.log(`  ${pair} (${pairEdges.length})`);
    for (const edge of pairEdges) {
      const type = edge.typeOnly ? "  [type]" : "";
      console.log(`    ${edge.importer}:${edge.line} -> ${edge.target}${type}`);
    }
  }
  console.log("");
}

export function runAudit(rootDir = root, out = console.log) {
  const corpus = readCorpus(rootDir);
  const classes = auditBoundaries(corpus);
  const log = out;
  log("Boundary audit — informational, not gating.");
  log("Violation classes from the wave-2 arch-debt inventory; `bun run circular`");
  log("(madge) remains the acyclic gate and is unaffected by these counts.\n");
  for (const entry of VIOLATION_CLASSES) {
    printClass(entry, classes.get(entry.id) ?? []);
  }
  for (const entry of CONTEXT_CLASSES) {
    const edges = classes.get(entry.id) ?? [];
    log(`${entry.id}  [${entry.label}]`);
    log(`  ${edges.length} edges\n`);
  }
  return { corpus, classes };
}

function isDirectEntrypoint() {
  if (!process.argv[1]) return false;
  return fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}

if (isDirectEntrypoint()) {
  try {
    runAudit();
  } catch (error) {
    console.error(`boundary audit: cannot scan the tree: ${error.message}`);
    process.exit(2);
  }
}
