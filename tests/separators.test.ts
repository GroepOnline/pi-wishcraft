import assert from "node:assert/strict";
import { test } from "node:test";
import { getSeparator } from "../src/theme/separators.ts";
import { ASCII_SEPARATORS, NERD_SEPARATORS } from "../src/theme/icons.ts";
import { EXTRA_MOTIONS } from "../src/motion/catalog-extra.ts";

test("v3 separator chars exist in both font sets", () => {
  // Nerd-font codepoints are powerline-adjacent block glyphs, not ASCII.
  assert.equal(NERD_SEPARATORS.roundedLeft, "\uE0B6");
  assert.equal(NERD_SEPARATORS.roundedRight, "\uE0B4");
  assert.equal(NERD_SEPARATORS.bluntLeft, "▌");
  assert.equal(NERD_SEPARATORS.bluntRight, "▐");
  assert.equal(NERD_SEPARATORS.diamond, "◇");
  assert.equal(NERD_SEPARATORS.doubleLeft, "»");

  // ASCII fallbacks stay console-safe (no nerd codepoints).
  assert.deepEqual(
    [ASCII_SEPARATORS.roundedLeft, ASCII_SEPARATORS.roundedRight, ASCII_SEPARATORS.bluntLeft, ASCII_SEPARATORS.bluntRight],
    ["(", ")", "[", "]"],
  );
  assert.equal(ASCII_SEPARATORS.doubleLeft, ">");
});

test("v3 separator defs resolve to non-empty tokens", () => {
  for (const style of ["blunt", "rounded", "diamond", "double"] as const) {
    const def = getSeparator(style);
    assert.ok(def.left.length > 0, `${style}.left`);
    assert.ok(def.right.length > 0, `${style}.right`);
  }
});

test("v3 motion ids are unique and registered", () => {
  const ids = EXTRA_MOTIONS.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes("nimbus"));
  assert.ok(ids.includes("copper-switch"));
  const copper = EXTRA_MOTIONS.find((m) => m.id === "copper-switch")!;
  assert.equal(copper.loop, "finite");
  assert.equal(copper.kind, "frames");
});