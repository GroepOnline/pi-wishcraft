import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(import.meta.dirname, "../src/extension/ui/segment-navigator.ts"),
  "utf8",
);

test("segment navigator snapshots on detail open and does not run a live timer", () => {
  assert.match(source, /const snapshot = /);
  assert.match(source, /openDetail[\s\S]*snapshot\(\)/);
  assert.doesNotMatch(source, /setInterval\(/);
  assert.doesNotMatch(source, /SEGMENT_NAVIGATOR_REFRESH_MS/);
});
