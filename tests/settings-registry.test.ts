import test from "node:test";
import assert from "node:assert/strict";
import {
  SETTINGS_REGISTRY,
  SETTING_DEFAULTS,
  SETTING_GROUPS,
  effectiveSettingValue,
  getSettingDefinition,
  validateSettingValue,
} from "../src/config/settings-registry.ts";

test("setting ids and paths are unique", () => {
  assert.equal(new Set(SETTINGS_REGISTRY.map((item) => item.id)).size, SETTINGS_REGISTRY.length);
  assert.equal(new Set(SETTINGS_REGISTRY.map((item) => item.path)).size, SETTINGS_REGISTRY.length);
});

test("every setting belongs to a declared non-empty group", () => {
  const groupIds = new Set(SETTING_GROUPS.map((group) => group.id));
  for (const item of SETTINGS_REGISTRY) assert.equal(groupIds.has(item.group), true, item.id);
  for (const group of SETTING_GROUPS) {
    assert.ok(SETTINGS_REGISTRY.some((item) => item.group === group.id), group.id);
  }
});

test("select defaults are valid choices", () => {
  for (const item of SETTINGS_REGISTRY) {
    if (item.kind === "select" && item.defaultValue !== undefined) {
      assert.ok(item.choices.includes(item.defaultValue), item.id);
    }
  }
});

test("registry resolves canonical defaults and validates values", () => {
  const motion = getSettingDefinition("powerline.motionLevel");
  assert.ok(motion);
  assert.equal(
    effectiveSettingValue(motion, undefined),
    SETTING_DEFAULTS["powerline.motionLevel"],
  );
  assert.equal(validateSettingValue(motion, "reduced"), true);
  assert.equal(validateSettingValue(motion, "hyper"), false);

  const repairs = getSettingDefinition("harness.repairs");
  assert.ok(repairs);
  assert.equal(effectiveSettingValue(repairs, undefined), true);
  assert.equal(validateSettingValue(repairs, false), true);
  assert.equal(validateSettingValue(repairs, "off"), false);
});