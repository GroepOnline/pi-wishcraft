import test from "node:test";
import assert from "node:assert/strict";
import {
  assignNestedConfigValue,
  isUnsafeConfigKey,
  readConfigPath,
} from "../src/extension/settings/wishcraft-config.ts";

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
