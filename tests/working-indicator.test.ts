import assert from "node:assert/strict";
import test from "node:test";
import {
  nativeWorkingIndicator,
  workingIndicatorFrame,
  workingIndicatorStyles,
} from "../src/working-vibes/frames.ts";

test("working indicator exposes the supported styles", () => {
  assert.deepEqual(workingIndicatorStyles(), ["dots", "pulse", "bar", "ascii", "lantern", "braille", "motion"]);
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

test("motion style borrows the catalog frames and cadence", () => {
  const spec = nativeWorkingIndicator("motion", "full", false, {
    frames: ["◜", "◝", "◞", "◟"],
    intervalMs: 75,
  });
  assert.deepEqual(spec.frames, ["◜", "◝", "◞", "◟"]);
  assert.equal(spec.intervalMs, 75);
});

test("motion style falls back to the lantern ramp without a catalog def", () => {
  const spec = nativeWorkingIndicator("motion", "full");
  assert.deepEqual(spec.frames, [...nativeWorkingIndicator("lantern", "full").frames]);
});

test("motion style still respects parity and accessibility", () => {
  const catalog = { frames: ["◜", "◝", "◞", "◟"], intervalMs: 75 };
  assert.deepEqual(nativeWorkingIndicator("motion", "off", false, catalog).frames, ["◜"]);
  assert.equal(nativeWorkingIndicator("motion", "functional", false, catalog).frames.length, 2);
  // ASCII glyph policy wins over the catalog: no wide glyphs leak through.
  assert.deepEqual(
    nativeWorkingIndicator("motion", "full", true, catalog).frames,
    ["-", "\\", "|", "/"],
  );
});
