import test from "node:test";
import assert from "node:assert/strict";
import {
  assignNestedConfigValue,
  buildConfigGroups,
  isUnsafeConfigKey,
  readConfigPath,
} from "../src/extension/settings/wishcraft-config.ts";
import { WELCOME_ART_THEMES } from "../src/welcome/welcome-art.ts";

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

test("Welcome & vibes group exposes the art selector, animation, and quiet startup", () => {
  const groups = buildConfigGroups({});
  const welcome = groups.find((g) => g.title === "Welcome & vibes");
  assert.ok(welcome, "Welcome & vibes group exists");

  const art = welcome.items.find((i) => i.path === "wishcraft.welcome.art");
  assert.equal(art?.kind, "select");
  assert.deepEqual(art?.choices, [...WELCOME_ART_THEMES]);

  const animate = welcome.items.find(
    (i) => i.path === "wishcraft.welcome.animateLantern",
  );
  assert.equal(animate?.kind, "toggle");

  const quiet = welcome.items.find((i) => i.path === "quietStartup");
  assert.equal(quiet?.kind, "toggle");
});

test("Model & git details group exposes real parsed segment options", () => {
  const groups = buildConfigGroups({});
  const group = groups.find((g) => g.title === "Model & git details");
  assert.ok(group, "Model & git details group exists");
  const paths = group.items.map((i) => i.path);
  assert.ok(paths.includes("powerline.segmentOptions.model.display"));
  assert.ok(paths.includes("powerline.segmentOptions.git.polling"));
  assert.ok(paths.includes("powerline.segmentOptions.git.showStaged"));
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
