import assert from "node:assert/strict";
import { test } from "node:test";
import { parseUnifiedDiff, applyFilePatch, undoLastPatch } from "../src/tools/patch.ts";
import { searchRipgrep } from "../src/tools/ripgrep.ts";
import { renderSparkline, renderAsciiGraph } from "../src/tools/graph.ts";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";

test("patch tool parses unified diffs cleanly", () => {
  const diff = `--- a/test.txt
+++ b/test.txt
@@ -1,3 +1,3 @@
 line1
-old line
+new line
 line3`;

  const patches = parseUnifiedDiff(diff);
  assert.equal(patches.length, 1);
  assert.equal(patches[0].targetFile, "test.txt");
  assert.equal(patches[0].hunks.length, 1);
});

test("patch tool applies patch atomically with backup and supports undo", () => {
  const testFile = join(process.cwd(), "temp-test-patch.txt");
  writeFileSync(testFile, "line1\nold line\nline3\n", "utf-8");

  try {
    const diff = `--- a/temp-test-patch.txt
+++ b/temp-test-patch.txt
@@ -1,3 +1,3 @@
 line1
-old line
+new line
 line3`;

    const patches = parseUnifiedDiff(diff);
    const result = applyFilePatch(patches[0]);
    assert.equal(result.success, true);
    assert.equal(result.appliedHunks, 1);

    const undo = undoLastPatch();
    assert.equal(undo.success, true);
  } finally {
    if (existsSync(testFile)) unlinkSync(testFile);
  }
});

test("ripgrep tool executes search with fallback", () => {
  const res = searchRipgrep("pi-wishcraft", { maxResults: 5 });
  assert.equal(typeof res.engine, "string");
  assert.ok(Array.isArray(res.matches));
});

test("graph tool renders braille sparklines and ascii graphs", () => {
  const sparkline = renderSparkline([1, 5, 2, 8, 3, 9, 4, 10], 10);
  assert.ok(typeof sparkline === "string");
  assert.ok(sparkline.length > 0);

  const graph = renderAsciiGraph(
    [{ id: "a", label: "nodeA" }, { id: "b", label: "nodeB" }],
    [{ from: "a", to: "b", label: "calls" }]
  );
  assert.ok(Array.isArray(graph));
  assert.ok(graph.length > 0);
});
