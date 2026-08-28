import assert from "node:assert/strict";
import test from "node:test";
import { workingIndicatorFrame, workingIndicatorStyles } from "../src/working-vibes/frames.ts";

test("working indicator exposes the supported styles", () => {
  assert.deepEqual(workingIndicatorStyles(), ["dots", "pulse", "bar", "ascii"]);
});

test("working indicator cycles deterministically", () => {
  assert.equal(workingIndicatorFrame("ascii", 0), "-");
  assert.equal(workingIndicatorFrame("ascii", 1), "\\");
  assert.equal(workingIndicatorFrame("ascii", 4), "-");
});

test("reduced and off motion stay static", () => {
  assert.equal(workingIndicatorFrame("pulse", 0, "reduced"), "○");
  assert.equal(workingIndicatorFrame("pulse", 3, "off"), "○");
});
