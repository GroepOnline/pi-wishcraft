import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_TOKENS,
  SEMANTIC_TOKEN_ROLE,
  THINKING_COLORS,
  colorSchemeFromTokens,
  mergeTokenColors,
  presetColorScheme,
  resolveTokens,
  token,
} from "../src/config/tokens.ts";
import { PRESETS, resolvePreset } from "../src/config/presets.ts";
import { getDefaultColors } from "../src/theme/theme.ts";
import type { ColorScheme, SemanticColor, StatusLinePreset } from "../src/config/types.ts";

test("default tokens reproduce the current default color scheme", () => {
  assert.deepEqual(colorSchemeFromTokens(DEFAULT_TOKENS), getDefaultColors());
});

test("every semantic color is covered by a token or the thinking passthrough", () => {
  const covered = new Set<string>([
    ...Object.keys(SEMANTIC_TOKEN_ROLE),
    ...Object.keys(THINKING_COLORS),
  ]);
  for (const semantic of Object.keys(getDefaultColors()) as SemanticColor[]) {
    assert.ok(covered.has(semantic), `${semantic} has no token mapping`);
  }
});

test("presets without tokens keep their exact colors", () => {
  for (const name of Object.keys(PRESETS) as StatusLinePreset[]) {
    const preset = PRESETS[name];
    const resolved = presetColorScheme(preset, getDefaultColors);
    assert.deepEqual(
      resolved,
      preset.colors ?? getDefaultColors(),
      `${name} changed color scheme`,
    );
  }
});

test("a tokenised preset derives its segment colors", () => {
  const colors = presetColorScheme(
    { tokens: { primary: "#ff8800", warning: "error" } },
    getDefaultColors,
  );
  assert.equal(colors.model, "#ff8800");
  assert.equal(colors.gitDirty, "error");
  assert.equal(colors.contextWarn, "error");
  assert.equal(colors.path, DEFAULT_TOKENS.secondary);
});

test("explicit colors win over derived tokens", () => {
  const colors = presetColorScheme(
    { tokens: { primary: "#ff8800" }, colors: { model: "success" } },
    getDefaultColors,
  );
  assert.equal(colors.model, "success");
  assert.equal(colors.shellMode, DEFAULT_TOKENS.accent);
});

test("thinking levels are passed through, not tokenised", () => {
  const colors = colorSchemeFromTokens({ ...DEFAULT_TOKENS, primary: "#000000" });
  assert.equal(colors.thinking, "thinkingOff");
  assert.equal(colors.thinkingMedium, "thinkingMedium");
});

test("partial token sets fall back to the default palette", () => {
  const tokens = resolveTokens({ motionHot: "#ff0000" });
  assert.equal(tokens.motionHot, "#ff0000");
  assert.equal(tokens.text, DEFAULT_TOKENS.text);
  assert.equal(token("motionTrail"), DEFAULT_TOKENS.motionTrail);
  assert.equal(token("motionTrail", { motionTrail: "dim" }), "dim");
});

test("undefined entries do not erase defaults", () => {
  const tokens = resolveTokens({ primary: undefined });
  assert.equal(tokens.primary, DEFAULT_TOKENS.primary);
});

test("mergeTokenColors ignores undefined overrides", () => {
  const overrides: ColorScheme = { model: undefined };
  const colors = mergeTokenColors(DEFAULT_TOKENS, overrides);
  assert.equal(colors.model, DEFAULT_TOKENS.primary);
});

test("built-in presets still resolve by name", () => {
  assert.equal(resolvePreset("nerd"), PRESETS.nerd);
  assert.equal(resolvePreset("default"), PRESETS.default);
});
