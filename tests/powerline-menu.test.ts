import test from "node:test";
import assert from "node:assert/strict";
import {
  assertPowerlineMenuBounds,
  buildPowerlineMenuItems,
  findPowerlineMenuNode,
  powerlineMenuToSelectItems,
} from "../src/extension/ui/powerline-menu.ts";

test("powerline menu has at most three top-level entries", () => {
  const items = assertPowerlineMenuBounds();
  assert.equal(items.length, 3);
  assert.deepEqual(
    items.map((item) => item.id),
    ["navigate", "configure", "status"],
  );
});

test("status exposes working Status drill-down entries", () => {
  const status = findPowerlineMenuNode("status");
  assert.ok(status?.children);
  assert.deepEqual(
    status.children.map((item) => item.id),
    ["ports", "tps", "toggle"],
  );
});

test("menu nodes map to SelectList items with descriptions", () => {
  const items = powerlineMenuToSelectItems(buildPowerlineMenuItems());
  assert.equal(items[0]?.value, "navigate");
  assert.equal(items[0]?.label, "Navigate segments");
  assert.match(items[0]?.description ?? "", /segment/);
});

test("assertPowerlineMenuBounds rejects a fourth top-level item", () => {
  assert.throws(
    () =>
      assertPowerlineMenuBounds([
        ...buildPowerlineMenuItems(),
        { id: "extra", label: "Extra" },
      ]),
    /at most 3 top-level/,
  );
});
