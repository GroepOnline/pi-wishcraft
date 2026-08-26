import test from "node:test";
import assert from "node:assert/strict";
import {
  assignNestedConfigValue,
  buildConfigGroups,
  displayValue,
  isUnsafeConfigKey,
  nextToggleValue,
  readConfigPath,
} from "../src/extension/settings/wishcraft-config.ts";

function findItem(label: string) {
  for (const group of buildConfigGroups({})) {
    const item = group.items.find((i) => i.label === label);
    if (item) return item;
  }
  throw new Error(`config item not found: ${label}`);
}

test("read hints toggle defaults on and the first toggle disables it", () => {
  const item = findItem("Read hints");
  assert.equal(item.path, "wishcraft.readHints");
  assert.equal(item.defaultValue, true);
  // Unset (absent) value renders as enabled.
  assert.equal(displayValue(item, null), "on");
  // First toggle writes false, disabling read hints.
  assert.equal(nextToggleValue(item, null), false);
  // Toggling back on.
  assert.equal(nextToggleValue(item, false), true);
});

test("motion level is a select in the flat settings list", () => {
  const item = findItem("Motion level");
  assert.equal(item.path, "powerline.motionLevel");
  assert.deepEqual(item.choices, ["full", "reduced", "functional", "off"]);
});

test("structural appearance base is a select in the flat settings list", () => {
  const item = findItem("Structural base");
  assert.equal(item.path, "powerline.appearance.base");
  assert.equal(item.kind, "select");
  assert.ok(item.choices?.includes("lanternwake"));
  assert.ok(item.choices?.includes("hexforge"));
  assert.equal(item.choices?.length, 10);
});

test("a normal opt-in toggle defaults off and the first toggle enables it", () => {
  const item = findItem("Inline expand /command and $skill");
  assert.notEqual(item.defaultValue, true);
  assert.equal(displayValue(item, null), "off");
  assert.equal(nextToggleValue(item, null), true);
});

test("runtime-default-on toggles render and toggle from the registry default", () => {
  for (const label of ["Hooks enabled", "Tool-input repairs"]) {
    const item = findItem(label);
    assert.equal(item.defaultValue, true);
    assert.equal(displayValue(item, null), "on");
    assert.equal(nextToggleValue(item, null), false);
  }
});

test("displayValue renders absent/empty values", () => {
  const toggle = findItem("Hooks enabled");
  assert.equal(displayValue(toggle, true), "on");
  assert.equal(displayValue(toggle, false), "off");
  const text = findItem("Currency");
  assert.equal(displayValue(text, null), "—");
  assert.equal(displayValue(text, "EUR"), "EUR");
});

test("isUnsafeConfigKey blocks prototype-pollution segments", () => {
  assert.equal(isUnsafeConfigKey("__proto__"), true);
  assert.equal(isUnsafeConfigKey("constructor"), true);
  assert.equal(isUnsafeConfigKey("prototype"), true);
  assert.equal(isUnsafeConfigKey("hooksEnabled"), false);
});

test("assignNestedConfigValue writes a nested leaf and can delete it", () => {
  const root: Record<string, unknown> = {};
  assert.equal(
    assignNestedConfigValue(root, ["segmentOptions", "path", "mode"], "basename"),
    true,
  );
  assert.equal(
    readConfigPath({ powerline: root }, "powerline.segmentOptions.path.mode"),
    "basename",
  );
  assert.equal(assignNestedConfigValue(root, ["segmentOptions", "path", "mode"], null), true);
  const pathOpts = (root.segmentOptions as Record<string, unknown>).path as Record<
    string,
    unknown
  >;
  assert.equal(Object.prototype.hasOwnProperty.call(pathOpts, "mode"), false);
});

test("assignNestedConfigValue refuses prototype-polluting keys and does not mutate Object.prototype", () => {
  const marker = "__wishcraft_proto_pollution_test__";
  const root: Record<string, unknown> = {};
  assert.equal(assignNestedConfigValue(root, ["__proto__", marker], true), false);
  assert.equal(assignNestedConfigValue(root, ["constructor", "prototype", marker], true), false);
  assert.equal(assignNestedConfigValue(root, ["nested", "prototype"], "x"), false);
  assert.equal(
    Object.prototype.hasOwnProperty.call(Object.prototype, marker),
    false,
  );
  assert.equal(({} as Record<string, unknown>)[marker], undefined);
  assert.deepEqual(root, {});
});
