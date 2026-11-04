import test from "node:test";
import assert from "node:assert/strict";
import { stripCaptureNoisePrefix } from "../src/extension/queue/queue-integration.ts";
import { allWorkingIndicatorFrames } from "../src/working-vibes/frames.ts";

test("strips leading pi working-indicator frames from captured idea text", () => {
  assert.equal(
    stripCaptureNoisePrefix("⠙ Working... ook toevoegen: spinner library ding"),
    "ook toevoegen: spinner library ding",
  );
  assert.equal(
    stripCaptureNoisePrefix("⠹⠹ Working… rest"),
    "rest",
  );
});

test("leaves normal idea text untouched", () => {
  const text = "gewone idee tekst";
  assert.equal(stripCaptureNoisePrefix(text), text);
});

test("all-noise capture strips to empty", () => {
  assert.equal(stripCaptureNoisePrefix("⠋ Working..."), "");
});

test("strips every frame of every working-indicator style", () => {
  for (const frame of allWorkingIndicatorFrames()) {
    assert.equal(
      stripCaptureNoisePrefix(`${frame} Working... bewaar dit idee`),
      "bewaar dit idee",
      `frame ${JSON.stringify(frame)} leaked into captured text`,
    );
  }
});

test("does not eat ideas that merely start with a dash or a bracket", () => {
  assert.equal(stripCaptureNoisePrefix("- werken aan de lantaarn"), "- werken aan de lantaarn");
  assert.equal(stripCaptureNoisePrefix("[todo] Working on it"), "[todo] Working on it");
});
