import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveEffectiveConfig,
  SETTING_PATHS,
  type SettingInput,
} from "../src/config/effective.ts";

const baseInput = (overrides: Record<string, unknown> = {}): SettingInput => overrides;

test("returns registry defaults when input is empty", () => {
  const result = resolveEffectiveConfig(baseInput());
  for (const path of SETTING_PATHS) {
    assert.ok(path in result.values, `default for ${path} missing`);
  }
  assert.equal(result.errors.length, 0);
});

test("user override wins over default", () => {
  const result = resolveEffectiveConfig(baseInput({ "powerline.preset": "minimal" }));
  assert.equal(result.values["powerline.preset"], "minimal");
  assert.equal(result.errors.length, 0);
});

test("invalid select value falls back to default and reports an error", () => {
  const result = resolveEffectiveConfig(baseInput({ "powerline.preset": "does-not-exist" }));
  assert.equal(result.values["powerline.preset"], "default");
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0]?.message ?? "", /powerline\.preset/);
});

test("invalid number value falls back to default and reports an error", () => {
  const result = resolveEffectiveConfig(baseInput({ "powerline.segmentOptions.tps.windowMs": "fast" }));
  assert.equal(result.values["powerline.segmentOptions.tps.windowMs"], 1000);
  assert.equal(result.errors.length, 1);
});

test("unknown key is ignored silently and never reported as an error", () => {
  const result = resolveEffectiveConfig(baseInput({ "wishcraft.bogus": true }));
  assert.ok(!("wishcraft.bogus" in result.values));
  assert.equal(result.errors.length, 0);
});

test("toggle values coerce strings like 'on' and 'off'", () => {
  const a = resolveEffectiveConfig(baseInput({ "powerline.welcome": "on" }));
  const b = resolveEffectiveConfig(baseInput({ "powerline.welcome": "off" }));
  assert.equal(a.values["powerline.welcome"], true);
  assert.equal(b.values["powerline.welcome"], false);
});

test("values keep the registry-declared type at the read site", () => {
  const result = resolveEffectiveConfig(baseInput());
  const preset = result.values["powerline.preset"];
  assert.equal(typeof preset, "string");
  const window = result.values["powerline.segmentOptions.tps.windowMs"];
  assert.equal(typeof window, "number");
  const welcome = result.values["powerline.welcome"];
  assert.equal(typeof welcome, "boolean");
});

test("error entries carry the path and offending raw value", () => {
  const result = resolveEffectiveConfig(baseInput({ "powerline.motionLevel": "ultra" }));
  assert.equal(result.errors[0]?.path, "powerline.motionLevel");
  assert.equal(result.errors[0]?.rawValue, "ultra");
});
