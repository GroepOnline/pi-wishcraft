import test from "node:test";
import assert from "node:assert/strict";
import { stripCaptureNoisePrefix } from "../src/extension/queue/queue-integration.ts";

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
