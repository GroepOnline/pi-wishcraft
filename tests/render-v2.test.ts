import assert from "node:assert/strict";
import test from "node:test";
import {
  computeLaneLayout,
  type LayoutSegment,
  type LayoutConfig,
} from "../src/render/layout.ts";
import { paintLane, paintLayout, type PaintedLane } from "../src/render/paint.ts";

const cfg: LayoutConfig = {
  primary: ["model", "context", "git", "queue"],
  secondary: ["vibe", "shortcut"],
  separator: " | ",
  maxWidth: 120,
};

function segments(items: Array<[string, string, number]>): LayoutSegment[] {
  return items.map(([id, text, priority]) => ({ id, text, priority }));
}

test("layout: visible segments are placed in priority order on the primary lane", () => {
  const out = computeLaneLayout(segments([
    ["model", "grok-4.6", 10],
    ["context", "42%", 8],
    ["git", "feat/v2", 5],
    ["queue", "2 items", 3],
  ]), 80, cfg);
  assert.equal(out.primary.map((s) => s.id).join(","), "model,context,git,queue");
  assert.equal(out.secondary.length, 0);
  assert.equal(out.dropped.length, 0);
});

test("layout: low-priority segments are dropped when width is tight", () => {
  const out = computeLaneLayout(segments([
    ["model", "grok-4.6", 10],
    ["context", "42%", 8],
    ["git", "feat/v2", 5],
    ["queue", "2 items", 3],
  ]), 20, cfg);
  assert.ok(out.dropped.length > 0, "tight width must drop something");
  // Highest priority segments are kept first
  const kept = new Set([...out.primary, ...out.secondary].map((s) => s.id));
  assert.ok(kept.has("model"), "model must be kept");
  assert.ok(!kept.has("queue"), "queue must be dropped first");
});

test("layout: hidden segments are excluded from output", () => {
  const out = computeLaneLayout(segments([
    ["model", "grok", 10],
    ["hidden", "secret", 1],
  ]), 80, {
    ...cfg,
    primary: ["model", "hidden"],
  });
  const kept = [...out.primary, ...out.secondary].map((s) => s.id);
  assert.ok(!kept.includes("hidden"), "hidden segments must be excluded");
});

test("layout: width 40 produces the small-width class", () => {
  const out = computeLaneLayout(segments([
    ["model", "grok-4.6", 10],
    ["context", "42%", 8],
  ]), 40, cfg);
  assert.equal(out.widthClass, "small");
});

test("layout: width 120 produces the wide-width class", () => {
  const out = computeLaneLayout(segments([
    ["model", "grok-4.6", 10],
  ]), 120, cfg);
  assert.equal(out.widthClass, "wide");
});

test("paint: paintLane wraps a segment in a theme-style bg and the segment text", () => {
  const lane: PaintedLane = {
    id: "model",
    text: "grok",
    bg: "\x1b[44m",
    fg: "\x1b[37m",
  };
  const out = paintLane(lane);
  assert.match(out, /grok/);
  assert.match(out, /\x1b\[44m/);
});

test("paint: paintLayout joins lanes with the configured separator", () => {
  const layout: PaintedLayout = {
    primary: [
      { id: "model", text: "grok", bg: "", fg: "" },
      { id: "ctx", text: "42%", bg: "", fg: "" },
    ],
    secondary: [],
    dropped: [],
    widthClass: "wide",
  };
  const out = paintLayout(layout, " | ");
  assert.equal(out, "grok\x1B[0m | 42%\x1B[0m");
});

test("layout: empty input returns an empty layout with no thrown", () => {
  const out = computeLaneLayout([], 80, cfg);
  assert.equal(out.primary.length, 0);
  assert.equal(out.secondary.length, 0);
  assert.equal(out.dropped.length, 0);
});
