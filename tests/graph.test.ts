import assert from "node:assert/strict";
import { test } from "node:test";
import { renderSparkline, renderAsciiGraph } from "../src/tools/graph.ts";

test("graph tool renders braille sparklines and ascii graphs", () => {
  const sparkline = renderSparkline([1, 5, 2, 8, 3, 9, 4, 10], 10);
  assert.ok(typeof sparkline === "string");
  assert.ok(sparkline.length > 0);

  const graph = renderAsciiGraph(
    [{ id: "a", label: "nodeA" }, { id: "b", label: "nodeB" }],
    [{ from: "a", to: "b", label: "calls" }]
  );
  assert.ok(Array.isArray(graph));
  assert.ok(graph.length > 0);
});