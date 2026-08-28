import assert from "node:assert/strict";
import test from "node:test";
import { renderPowerlineV2, type V2Segment } from "../src/render/v2-adapter.ts";

test("v2-adapter: empty input returns empty top + secondary", () => {
  const out = renderPowerlineV2([], 80, {
    primary: [],
    secondary: [],
  });
  assert.equal(out.topContent, "");
  assert.equal(out.secondaryContent, "");
});

test("v2-adapter: visible segments appear in the top content", () => {
  const segments: V2Segment[] = [
    { id: "model", text: "grok-4.6", priority: 10 },
    { id: "context", text: "42%", priority: 8 },
  ];
  const out = renderPowerlineV2(segments, 80, {
    primary: ["model", "context"],
    secondary: [],
  });
  assert.match(out.topContent, /grok-4\.6/);
  assert.match(out.topContent, /42%/);
  assert.equal(out.secondaryContent, "");
});

test("v2-adapter: secondary segments appear in the secondary content", () => {
  const segments: V2Segment[] = [
    { id: "model", text: "grok-4.6", priority: 10 },
    { id: "vibe", text: "shipping", priority: 5 },
  ];
  const out = renderPowerlineV2(segments, 80, {
    primary: ["model"],
    secondary: ["vibe"],
  });
  assert.match(out.topContent, /grok-4\.6/);
  assert.match(out.secondaryContent, /shipping/);
});

test("v2-adapter: tight width drops low-priority segments", () => {
  const segments: V2Segment[] = [
    { id: "model", text: "grok-4.6", priority: 10 },
    { id: "queue", text: "two items queued here", priority: 1 },
  ];
  const out = renderPowerlineV2(segments, 20, {
    primary: ["model", "queue"],
    secondary: [],
  });
  assert.match(out.topContent, /grok-4\.6/);
  assert.doesNotMatch(out.topContent, /queued/);
  assert.equal(out.dropped.length, 1);
});

test("v2-adapter: hidden segments (not in either lane) are dropped", () => {
  const segments: V2Segment[] = [
    { id: "model", text: "grok", priority: 10 },
    { id: "internal", text: "secret", priority: 1 },
  ];
  const out = renderPowerlineV2(segments, 80, {
    primary: ["model"],
    secondary: [],
  });
  assert.equal(out.dropped.some((d) => d.id === "internal"), true);
  assert.doesNotMatch(out.topContent, /secret/);
});

test("v2-adapter: width class is exposed for downstream sizing", () => {
  const out = renderPowerlineV2([], 40, { primary: [], secondary: [] });
  assert.equal(out.widthClass, "small");
  const wide = renderPowerlineV2([], 200, { primary: [], secondary: [] });
  assert.equal(wide.widthClass, "wide");
});
