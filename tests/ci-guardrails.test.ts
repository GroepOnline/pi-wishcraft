import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  GRANDFATHERED,
  MAX_LINES,
  countLines,
  evaluateFileSizes,
  growthCeiling,
} from "../scripts/check-file-size.mjs";
import {
  areaOf,
  auditBoundaries,
  classifyEdge,
  extensionLeaf,
  extractImportEdges,
  resolveSpecifier,
} from "../scripts/check-boundaries.mjs";

const root = resolve(import.meta.dirname, "..");

// --- check-file-size.mjs ----------------------------------------------------

test("file-size: countLines matches logical lines, wc -l semantics", () => {
  assert.equal(countLines(""), 0);
  assert.equal(countLines("a"), 1);
  assert.equal(countLines("a\n"), 1);
  assert.equal(countLines("a\nb\n"), 2);
  // A file without a trailing newline still counts its last line.
  assert.equal(countLines("a\nb"), 2);
});

test("file-size: a new file over the limit fails", () => {
  const { failures } = evaluateFileSizes({
    files: new Map([["src/new-module.ts", MAX_LINES + 1]]),
    grandfathered: new Map(),
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /exceeds the 450-line/);
  assert.match(failures[0], /do not add new GRANDFATHERED entries/);
});

test("file-size: at-the-limit files and grandfathered files pass", () => {
  const { failures, notes } = evaluateFileSizes({
    files: new Map([
      ["src/ok.ts", MAX_LINES],
      ["src/big.ts", 500],
    ]),
    grandfathered: new Map([["src/big.ts", 500]]),
  });
  assert.deepEqual(failures, []);
  assert.deepEqual(notes, []);
});

test("file-size: grandfathered growth inside tolerance notes, past 10% fails", () => {
  const ceiling = growthCeiling(500);
  assert.equal(ceiling, 550);
  const within = evaluateFileSizes({
    files: new Map([["src/big.ts", 510]]),
    grandfathered: new Map([["src/big.ts", 500]]),
  });
  assert.deepEqual(within.failures, []);
  assert.equal(within.notes.length, 1);
  assert.match(within.notes[0], /pending/);

  const over = evaluateFileSizes({
    files: new Map([["src/big.ts", 551]]),
    grandfathered: new Map([["src/big.ts", 500]]),
  });
  assert.equal(over.failures.length, 1);
  assert.match(over.failures[0], /grew more than 10%/);
});

test("file-size: a landed split or a missing file makes the entry stale", () => {
  const shrunk = evaluateFileSizes({
    files: new Map([["src/big.ts", MAX_LINES]]),
    grandfathered: new Map([["src/big.ts", 500]]),
  });
  assert.equal(shrunk.failures.length, 1);
  assert.match(shrunk.failures[0], /remove the entry so it cannot regrow/);

  const gone = evaluateFileSizes({
    files: new Map(),
    grandfathered: new Map([["src/big.ts", 500]]),
  });
  assert.equal(gone.failures.length, 1);
  assert.match(gone.failures[0], /gone or untracked/);
});

test("file-size: the grandfather list has no stale entries on this tree", async () => {
  const { measureFiles } = await import("../scripts/check-file-size.mjs");
  const files = measureFiles(root);
  for (const [file, baseline] of GRANDFATHERED) {
    const lines = files.get(file);
    assert.ok(lines !== undefined, `GRANDFATHERED entry ${file} is not a tracked .ts file`);
    assert.ok(lines > MAX_LINES, `GRANDFATHERED entry ${file} is ${lines} lines — remove it`);
    assert.ok(
      lines <= growthCeiling(baseline),
      `GRANDFATHERED ${file} is ${lines} lines, past its ${growthCeiling(baseline)} ceiling`,
    );
  }
});

// --- check-boundaries.mjs ---------------------------------------------------

test("boundaries: extractImportEdges reads every specifier shape", () => {
  const edges = extractImportEdges(
    [
      `import { a } from "./a.ts";`,
      `import type { b } from "./b.ts";`,
      `import "./side.ts";`,
      `export * from "./c.ts";`,
      `export type { d } from "./d.ts";`,
      `import type {`,
      `  e,`,
      `} from "./e.ts";`,
      `type X = import("./f.ts").X;`,
    ].join("\n"),
  );
  assert.deepEqual(
    edges.map((edge) => [edge.specifier, edge.typeOnly]),
    [
      ["./a.ts", false],
      ["./b.ts", true],
      ["./side.ts", false],
      ["./c.ts", false],
      ["./d.ts", true],
      ["./e.ts", true],
      ["./f.ts", true],
    ],
  );
});

test("boundaries: resolveSpecifier resolves relative, skips external", () => {
  assert.equal(
    resolveSpecifier("src/extension/ui/deck/component.ts", "../../skills/workbench.ts"),
    "src/extension/skills/workbench.ts",
  );
  assert.equal(resolveSpecifier("src/a.ts", "./b.ts"), "src/b.ts");
  assert.equal(resolveSpecifier("src/a.ts", "node:fs"), null);
  assert.equal(resolveSpecifier("src/a.ts", "@earendil-works/pi-tui"), null);
  // Repo-root files resolve; paths that would escape the root do not.
  assert.equal(resolveSpecifier("queue/store.ts", "../outside.ts"), "outside.ts");
  assert.equal(resolveSpecifier("queue/store.ts", "../../outside.ts"), null);
});

test("boundaries: classifyEdge marks each wave-2 violation class", () => {
  // §2a leaf -> sibling leaf, bypassing the hub.
  assert.equal(
    classifyEdge("src/extension/ui/x.ts", "src/extension/skills/y.ts"),
    "leaf-to-leaf",
  );
  // §2b the hub importing a leaf.
  assert.equal(
    classifyEdge("src/extension/core/state.ts", "src/extension/queue/q.ts"),
    "hub-to-leaf",
  );
  // §2c a declared-standalone dir reaching into src/.
  assert.equal(classifyEdge("bash-mode/editor.ts", "src/shortcuts/matching.ts"), "standalone-to-src");
  assert.equal(classifyEdge("queue/store.ts", "src/paths/agent-dirs.ts"), "standalone-to-src");
  // §2d a src/ domain reaching into an extension leaf.
  assert.equal(
    classifyEdge("src/studio/actions.ts", "src/extension/skills/registry.ts"),
    "src-to-extension-leaf",
  );
});

test("boundaries: classifyEdge leaves the sanctioned directions alone", () => {
  // Leaf -> hub is the designed direction; the barrel may reach anything.
  assert.equal(classifyEdge("src/extension/ui/x.ts", "src/extension/core/state.ts"), "leaf-to-hub");
  assert.equal(classifyEdge("src/extension/ui/a.ts", "src/extension/ui/b.ts"), "intra-leaf");
  assert.equal(classifyEdge("index.ts", "src/extension/session/activate.ts"), "barrel");
  assert.equal(classifyEdge("src/config/parse.ts", "src/config/types.ts"), "ok");
  // src -> hub is a reported context class, not a violation.
  assert.equal(
    classifyEdge("src/theme/theme.ts", "src/extension/core/debug-log.ts"),
    "src-to-hub",
  );
});

test("boundaries: extensionLeaf and areaOf render unambiguous area names", () => {
  assert.equal(extensionLeaf("src/extension/ui/deck/component.ts"), "ui");
  assert.equal(extensionLeaf("src/config/parse.ts"), null);
  assert.equal(areaOf("src/extension/ui/x.ts"), "ext/ui");
  assert.equal(areaOf("src/studio/actions.ts"), "src/studio");
  assert.equal(areaOf("bash-mode/editor.ts"), "bash-mode");
});

test("boundaries: auditBoundaries buckets edges by class", () => {
  const classes = auditBoundaries(
    new Map([
      ["src/extension/ui/a.ts", `import { b } from "../skills/b.ts";\n`],
      ["src/extension/skills/b.ts", `import type { C } from "../core/types.ts";\n`],
      ["queue/store.ts", `import { p } from "../src/paths/agent-dirs.ts";\n`],
      ["src/studio/actions.ts", `import { s } from "../extension/skills/b.ts";\n`],
    ]),
  );
  assert.equal(classes.get("leaf-to-leaf")?.length, 1);
  assert.equal(classes.get("standalone-to-src")?.length, 1);
  assert.equal(classes.get("src-to-extension-leaf")?.length, 1);
  assert.equal(classes.get("hub-to-leaf")?.length ?? 0, 0);
  // leaf -> hub is sanctioned and is not reported at all.
  assert.equal(classes.get("src-to-hub")?.length ?? 0, 0);
});

// --- live end-to-end (mirrors audit-gate.test.ts' live gate run) ------------

test("ci guardrails: the file-size gate and boundary audit run green on this tree", () => {
  for (const script of ["check-file-size.mjs", "check-boundaries.mjs"]) {
    const out = execFileSync(process.execPath, [join(root, "scripts", script)], {
      cwd: root,
      encoding: "utf8",
    });
    assert.match(out, script === "check-file-size.mjs" ? /gate OK/ : /Boundary audit/);
  }
});
