import test from "node:test";
import assert from "node:assert/strict";
import { visibleWidth } from "@earendil-works/pi-tui";

import { MOTION_PAINT_CATALOG_COUNT } from "../src/motion/paint-catalog.ts";
import { KEYWORD_COUNT, matchKeyword } from "../src/motion/keywords.ts";
import {
  applyKeywordSpan,
  applyMotionStyle,
  stripMotionAnsi,
} from "../src/motion/primitives.ts";
import {
  decoratePowerlineLine,
  resolveMotionPaint,
} from "../src/motion/paint.ts";
import { motionPaintAllowed, parseMotionSettings } from "../src/motion/policy.ts";
import { colorForStyle } from "../src/motion/style-paint.ts";

const ON = { enabled: true, keywords: true };

test("paint catalog ships ≥30 named styles and ≥30 keywords", () => {
  assert.ok(MOTION_PAINT_CATALOG_COUNT >= 30);
  assert.ok(KEYWORD_COUNT >= 30);
});

test("matchKeyword is longest-match, word-boundary, case-insensitive", () => {
  const hard = matchKeyword("please THINK HARDER about this");
  assert.equal(hard?.pattern, "think harder");
  assert.equal(matchKeyword("rethink"), null);
  assert.equal(matchKeyword("ultrathink mode")?.pattern, "ultrathink");
  const hit = matchKeyword("please 👍 ultrathink")!;
  // Code-point index, not UTF-16: the emoji counts as one.
  assert.equal(hit.index, [...("please 👍 ")].length);
});

test("keyword span paint preserves visible width and only colors the word", () => {
  const text = "now ultrathink please";
  const hit = matchKeyword(text)!;
  const painted = applyKeywordSpan(
    text,
    hit.index,
    hit.length,
    "rainbow",
    5,
    1_000,
    2,
  );
  assert.equal(visibleWidth(painted), visibleWidth(text));
  assert.equal(stripMotionAnsi(painted), text);
  assert.notEqual(painted, text);
});

test("every style produces distinct, width-stable color output", () => {
  const styles = [
    "shimmer", "rainbow", "ember", "heat", "aurora",
    "comet", "prism", "tide", "pulse",
  ] as const;
  const seen = new Set<string>();
  for (const style of styles) {
    const frame = applyMotionStyle("wishcraft status line", style, 3, 500, 1);
    assert.equal(visibleWidth(frame), "wishcraft status line".length);
    seen.add(frame);
    // Styles must differ across time too.
    const later = applyMotionStyle("wishcraft status line", style, 3, 900, 1);
    assert.notEqual(frame, later, `${style} should animate`);
  }
  assert.ok(seen.size > 1);
});

test("colorForStyle returns rgb triples for every style", () => {
  for (const style of [
    "shimmer", "rainbow", "ember", "heat", "aurora",
    "comet", "prism", "tide", "pulse",
  ] as const) {
    const [r, g, b] = colorForStyle(style, 2, 10, 100, 3, 1);
    for (const channel of [r, g, b]) {
      assert.ok(channel >= 0 && channel <= 255);
    }
  }
});

test("paint resolution: keyword beats thinking beats streaming shimmer beats idle", () => {
  const base = {
    settings: ON,
    burstUntil: 0,
    now: 1_000,
    env: {} as NodeJS.ProcessEnv,
    color: true,
    level: "full" as const,
  };
  const idle = resolveMotionPaint({
    ...base,
    streaming: false,
    thinkingLevel: null,
    keyword: null,
  });
  assert.equal(idle.kind, "none");

  const streaming = resolveMotionPaint({
    ...base,
    streaming: true,
    thinkingLevel: null,
    keyword: null,
  });
  assert.equal(streaming.kind, "catalog");

  const thinking = resolveMotionPaint({
    ...base,
    streaming: true,
    thinkingLevel: "max",
    keyword: null,
  });
  assert.equal(thinking.kind, "catalog");
  assert.ok(thinking.kind === "catalog" && thinking.paintId === "rainbow-ultra");

  const keyword = {
    id: "wish",
    pattern: "wish",
    paintId: "wish-rise",
    index: 0,
    length: 4,
  };
  const kw = resolveMotionPaint({
    ...base,
    streaming: true,
    thinkingLevel: "max",
    keyword,
    burstUntil: 2_000,
  });
  assert.equal(kw.kind, "keyword");
  assert.ok(kw.kind === "keyword" && kw.burst);
});

test("policy gates: settings off, WISHCRAFT_REDUCED_MOTION, NO_COLOR, reduced level", () => {
  assert.equal(motionPaintAllowed(ON, {}, true, "full"), true);
  assert.equal(
    motionPaintAllowed({ enabled: false, keywords: true }, {}, true, "full"),
    false,
  );
  assert.equal(
    motionPaintAllowed(ON, { WISHCRAFT_REDUCED_MOTION: "1" }, true, "full"),
    false,
  );
  assert.equal(motionPaintAllowed(ON, {}, false, "full"), false);
  assert.equal(motionPaintAllowed(ON, {}, true, "reduced"), false);
  assert.equal(
    motionPaintAllowed({ enabled: true, keywords: false }, {}, true, "full"),
    true,
  );
});

test("parseMotionSettings reads nested wishcraft.motion with on-by-default", () => {
  assert.deepEqual(parseMotionSettings(undefined), ON);
  assert.deepEqual(parseMotionSettings({ motion: {} }), ON);
  assert.deepEqual(parseMotionSettings({ motion: { enabled: false } }), {
    enabled: false,
    keywords: true,
  });
  assert.deepEqual(parseMotionSettings({ motion: { keywords: false } }), {
    enabled: true,
    keywords: false,
  });
});

test("decoratePowerlineLine is identity when paint is none", () => {
  assert.equal(
    decoratePowerlineLine("hello", { kind: "none" }, 0),
    "hello",
  );
});
