import test from "node:test";
import assert from "node:assert/strict";

import { parsePowerlineConfig } from "../src/config/powerline-config.ts";
import {
  formatCostAlertMessage,
  shouldTriggerCostAlert,
} from "../src/extension/session/cost-alert.ts";

const PRESETS = ["default", "chef"] as const;

test("shouldTriggerCostAlert fires once when the threshold is crossed", () => {
  assert.equal(
    shouldTriggerCostAlert({
      totalCost: 5,
      threshold: 10,
      alreadyNotified: false,
    }),
    false,
  );
  assert.equal(
    shouldTriggerCostAlert({
      totalCost: 10,
      threshold: 10,
      alreadyNotified: false,
    }),
    true,
  );
  assert.equal(
    shouldTriggerCostAlert({
      totalCost: 11,
      threshold: 10,
      alreadyNotified: false,
    }),
    true,
  );
  assert.equal(
    shouldTriggerCostAlert({
      totalCost: 11,
      threshold: 10,
      alreadyNotified: true,
    }),
    false,
  );
});

test("shouldTriggerCostAlert treats missing/zero thresholds as disabled", () => {
  for (const threshold of [null, undefined, 0, -1, Number.NaN]) {
    assert.equal(
      shouldTriggerCostAlert({
        totalCost: 100,
        threshold,
        alreadyNotified: false,
      }),
      false,
      `threshold ${String(threshold)} should not fire`,
    );
  }
});

test("formatCostAlertMessage renders USD totals", () => {
  assert.equal(
    formatCostAlertMessage(1.25, 5, "USD"),
    "Session cost reached $1.25 (alert threshold $5.00)",
  );
});

test("parsePowerlineConfig parses and normalizes costAlert", () => {
  assert.equal(
    parsePowerlineConfig({ costAlert: 2.5 }, PRESETS).costAlert,
    2.5,
  );
  // Rounded to cents.
  assert.equal(
    parsePowerlineConfig({ costAlert: 1.234 }, PRESETS).costAlert,
    1.23,
  );
});

test("parsePowerlineConfig disables costAlert for non-positive or non-number values", () => {
  assert.equal(parsePowerlineConfig({ costAlert: 0 }, PRESETS).costAlert, null);
  assert.equal(parsePowerlineConfig({ costAlert: -1 }, PRESETS).costAlert, null);
  assert.equal(
    parsePowerlineConfig({ costAlert: "5" }, PRESETS).costAlert,
    null,
  );
  assert.equal(parsePowerlineConfig({}, PRESETS).costAlert, null);
});
