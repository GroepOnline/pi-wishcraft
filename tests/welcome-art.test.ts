import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_WELCOME_ART,
  WELCOME_ART_THEMES,
  normalizeWelcomeArt,
  renderWelcomeArt,
} from "../src/welcome/welcome-art.ts";

const stripAnsi = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, "");

test("WELCOME_ART_THEMES lists the three themes and defaults to lantern", () => {
  assert.deepEqual([...WELCOME_ART_THEMES], ["lantern", "balloon", "normal"]);
  assert.equal(DEFAULT_WELCOME_ART, "lantern");
});

test("normalizeWelcomeArt keeps known themes and falls back for anything else", () => {
  assert.equal(normalizeWelcomeArt("balloon"), "balloon");
  assert.equal(normalizeWelcomeArt("normal"), "normal");
  assert.equal(normalizeWelcomeArt("lantern"), "lantern");
  assert.equal(normalizeWelcomeArt("nope"), DEFAULT_WELCOME_ART);
  assert.equal(normalizeWelcomeArt(undefined), DEFAULT_WELCOME_ART);
  assert.equal(normalizeWelcomeArt(42), DEFAULT_WELCOME_ART);
});

test("every theme renders non-empty lines at the welcome column width", () => {
  for (const theme of WELCOME_ART_THEMES) {
    const lines = renderWelcomeArt(theme, 26);
    assert.ok(lines.length > 0, `${theme} should render lines`);
    assert.ok(
      lines.every((l) => typeof l === "string"),
      `${theme} lines are strings`,
    );
  }
});

test("the lantern theme renders the detailed pixel art (multiple rows)", () => {
  const lines = renderWelcomeArt("lantern", 26, { now: 0, animate: false });
  assert.ok(lines.length >= 10, "lantern art should be tall");
});

test("the lantern falls back to the pi mark when the column is too narrow", () => {
  const lines = renderWelcomeArt("lantern", 10);
  assert.ok(lines.some((l) => stripAnsi(l).includes("π")), "narrow lantern falls back to pi mark");
});

test("the balloon theme draws a wish balloon (heart motif)", () => {
  const text = renderWelcomeArt("balloon", 26).map(stripAnsi).join("\n");
  assert.ok(text.includes("♥"), "balloon should include the wish heart");
  assert.ok(text.includes("⌂"), "balloon should include the basket");
});

test("the normal theme draws the pi mark", () => {
  const text = renderWelcomeArt("normal", 26).map(stripAnsi).join("\n");
  assert.ok(text.includes("π"), "normal should include the pi glyph");
});
