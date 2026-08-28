// Tests for height-aware layout + multi-line paint. The U12 cutover kept
// powerline v2 single-row by default; the rail sigil (motion-candidates)
// opts into 3 rows via embedded `\n`. The editor wants one string per
// visual line.

import test from "node:test";
import assert from "node:assert/strict";

import { computeLaneLayout, type LayoutSegment } from "../src/render/layout.ts";
import {
  paintLayout,
  paintSecondary,
  type PaintedLane,
  type PaintedLayout,
} from "../src/render/paint.ts";

function lane(id: string, text: string, priority = 100): LayoutSegment {
  return { id, text, priority };
}

function painted(id: string, text: string, fg = "", bg = ""): PaintedLane {
  return { id, text, fg, bg };
}

test("computeLaneLayout preserves embedded row count", () => {
  const segs: LayoutSegment[] = [
    lane("left", "hello", 10_000),
    lane("rail", "row0\nrow1\nrow2", 5_000),
    lane("right", "world", 1_000),
  ];
  const result = computeLaneLayout(segs, 200, {
    primary: ["left", "rail", "right"],
    secondary: [],
    separator: "│",
    maxWidth: 200,
  });
  assert.equal(result.primary.length, 3);
  assert.equal(result.primaryRowCount, 3);
  assert.equal(result.secondaryRowCount, 1);
});

test("computeLaneLayout measures max line width, not full text width", () => {
  const segs: LayoutSegment[] = [
    lane("rail", "ab\ncdef\ngh", 5_000),
  ];
  const result = computeLaneLayout(segs, 4, {
    primary: ["rail"],
    secondary: [],
    separator: "│",
    maxWidth: 200,
  });
  // The widest line is 4 cols (cdef). Width budget is 4. With one segment
  // and no separator, used=0 → addedWidth=4. 0+4 <= 4 → fits.
  assert.equal(result.primary.length, 1);
  assert.equal(result.dropped.length, 0);
  assert.equal(result.primaryRowCount, 3);
});

test("paintLayout emits one rendered line per row", () => {
  const layout: PaintedLayout = {
    primary: [
      painted("left", "hello", "\x1b[37m"),
      painted("rail", "row0\nrow1\nrow2", "\x1b[33m"),
      painted("right", "world", "\x1b[34m"),
    ],
    secondary: [],
    dropped: [],
    widthClass: "wide",
    primaryRowCount: 3,
  };
  const out = paintLayout(layout, "│");
  const lines = out.split("\n");
  assert.equal(lines.length, 3);
  // Row 0 has the separator between segments; rows 1, 2 use space pads
  // (so the lane's column is held open for the tall rail).
  assert.match(lines[0]!, /hello.*row0.*world/);
  assert.match(lines[0]!, /\u001b\[33m/);
  assert.match(lines[1]!, /row1/);
  assert.match(lines[2]!, /row2/);
});

test("paintSecondary mirrors the row loop", () => {
  const layout: PaintedLayout = {
    primary: [],
    secondary: [
      painted("a", "x", "\x1b[31m"),
      painted("b", "y\nz", "\x1b[32m"),
    ],
    dropped: [],
    widthClass: "wide",
    primaryRowCount: 1,
    secondaryRowCount: 2,
  };
  const out = paintSecondary(layout, "│");
  const lines = out.split("\n");
  assert.equal(lines.length, 2);
  assert.match(lines[0]!, /x.*y/);
  assert.match(lines[1]!, /z/);
});
