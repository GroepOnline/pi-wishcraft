import assert from "node:assert/strict";
import test from "node:test";
import {
  nativeWorkingIndicator,
  workingIndicatorFrame,
  workingIndicatorStyles,
} from "../src/working-vibes/frames.ts";

test("working indicator exposes the supported styles", () => {
  assert.deepEqual(workingIndicatorStyles(), ["dots", "pulse", "bar", "ascii", "lantern", "braille"]);
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

test("native indicator animates under full motion and holds under reduced/off", () => {
  const full = nativeWorkingIndicator("braille", "full");
  assert.equal(full.frames.length, 10);
  assert.ok(full.intervalMs > 0 && full.intervalMs <= 200);
  assert.deepEqual(nativeWorkingIndicator("braille", "reduced").frames, ["⠋"]);
  assert.deepEqual(nativeWorkingIndicator("lantern", "off").frames, ["▁"]);
  assert.equal(nativeWorkingIndicator("pulse", "functional").frames.length, 2);
});

test("native indicator falls back to ASCII glyphs and tolerates unknown styles", () => {
  assert.deepEqual(nativeWorkingIndicator("braille", "full", true).frames, ["-", "\\", "|", "/"]);
  assert.equal(nativeWorkingIndicator("nope" as never, "full").frames[0], "·  ");
});
