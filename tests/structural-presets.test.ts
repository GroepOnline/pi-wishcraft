import assert from "node:assert/strict";
import { test } from "node:test";
import {
  effectiveAppearanceMix,
  glyphsPreferNerd,
  liveColorScheme,
  resolveAppearanceMix,
  resolveGlyphOrnament,
  validateAppearanceMotions,
  withStructuralPersonality,
} from "../src/config/appearance.ts";
import { PRESETS } from "../src/config/presets.ts";
import {
  STRUCTURAL_PRESET_NAMES,
  STRUCTURAL_PRESETS,
  completeMotionMap,
  getStructuralPreset,
  isStructuralPresetName,
  signatureMotionFor,
} from "../src/config/structural-presets.ts";
import { presetColorScheme } from "../src/config/tokens.ts";
import { getDefaultColors } from "../src/theme/theme.ts";
import { MOTION_CATALOG } from "../src/motion/catalog.ts";

test("ten structural presets are registered", () => {
  assert.equal(STRUCTURAL_PRESET_NAMES.length, 10);
  for (const name of STRUCTURAL_PRESET_NAMES) {
    assert.ok(isStructuralPresetName(name));
    const preset = STRUCTURAL_PRESETS[name];
    assert.equal(preset.name, name);
    assert.ok(preset.displayName.length > 0);
    assert.ok(preset.description.length > 0);
  }
});

test("every structural preset has a full personality stack", () => {
  for (const name of STRUCTURAL_PRESET_NAMES) {
    const preset = getStructuralPreset(name);
    assert.ok(preset.tokens.primary, `${name} missing primary token`);
    assert.ok(preset.chrome.frame, `${name} missing chrome.frame`);
    assert.ok(preset.signal.layout, `${name} missing signal.layout`);
    assert.ok(preset.signal.animation, `${name} missing signal.animation`);
    assert.ok(preset.motion.thinking, `${name} missing motion.thinking`);
    assert.ok(preset.deck.navigation, `${name} missing deck.navigation`);
    assert.ok(preset.glyphs.mode, `${name} missing glyphs.mode`);
  }
});

test("lanternwake uses ember-relay as signature motion", () => {
  const lantern = getStructuralPreset("lanternwake");
  assert.equal(lantern.signal.animation, "ember-relay");
  assert.equal(signatureMotionFor("lanternwake"), "ember-relay");
  assert.equal(lantern.motion.streaming, "ember-relay");
  assert.equal(lantern.welcome.motionId, "ember-relay");
});

test("structural motion refs exist in the catalog", () => {
  const catalogIds = new Set(MOTION_CATALOG.map((motion) => motion.id));
  for (const name of STRUCTURAL_PRESET_NAMES) {
    const preset = getStructuralPreset(name);
    assert.ok(catalogIds.has(preset.signal.animation), `${name} signal animation`);
    for (const ref of Object.values(preset.motion)) {
      if (ref) assert.ok(catalogIds.has(ref), `${name} motion ${ref}`);
    }
    if (preset.welcome.motionId) {
      assert.ok(catalogIds.has(preset.welcome.motionId), `${name} welcome motion`);
    }
  }
});

test("appearance mix decouples palette from signal layout", () => {
  const mixed = resolveAppearanceMix({
    base: "lanternwake",
    signalLayout: "threadbound",
    palette: "scryglass",
  });
  assert.equal(mixed.base, "lanternwake");
  assert.equal(mixed.tokens.primary, "#06b6d4");
  assert.equal(mixed.signal.layout, "woven");
  assert.equal(mixed.signal.animation, "stitch-travel");
  assert.equal(mixed.motion.streaming, "ember-relay");
});

test("appearance mix can override motion per event", () => {
  const mixed = resolveAppearanceMix({
    base: "lanternwake",
    motion: { streaming: "lunar-breathe", "tool.start": "hex-relay" },
  });
  assert.equal(mixed.motion.streaming, "lunar-breathe");
  assert.equal(mixed.motion["tool.start"], "hex-relay");
  assert.equal(mixed.motion.thinking, "ember-relay");
});

test("appearance mix can swap entire motion layer from another preset", () => {
  const mixed = resolveAppearanceMix({
    base: "lanternwake",
    motion: "moonwell",
  });
  assert.equal(mixed.motion.streaming, "lunar-breathe");
  assert.equal(mixed.tokens.primary, "#f59e0b");
});

test("validateAppearanceMotions passes for default mixes", () => {
  for (const name of STRUCTURAL_PRESET_NAMES) {
    const result = validateAppearanceMotions(resolveAppearanceMix({ base: name }));
    assert.equal(result.ok, true, name);
  }
});

test("glyph ornaments fall back to ASCII when nerd is unavailable", () => {
  const glyphs = getStructuralPreset("starweave").glyphs;
  assert.equal(resolveGlyphOrnament(glyphs, true, "model"), "✦");
  assert.equal(resolveGlyphOrnament(glyphs, false, "model"), "*");
  assert.equal(resolveGlyphOrnament(glyphs, false, "segment"), "*");
});

test("glyph mode auto respects nerd availability", () => {
  const glyphs = getStructuralPreset("wisp").glyphs;
  assert.equal(glyphsPreferNerd({ ...glyphs, mode: "nerd" }, false), true);
  assert.equal(glyphsPreferNerd({ ...glyphs, mode: "ascii" }, true), false);
  assert.equal(glyphsPreferNerd({ ...glyphs, mode: "auto" }, true), true);
  assert.equal(glyphsPreferNerd({ ...glyphs, mode: "auto" }, false), false);
});

test("withStructuralPersonality layers vNext fields without touching layout segments", () => {
  const base = PRESETS.minimal;
  const layered = withStructuralPersonality(base, "hexforge");
  assert.deepEqual(layered.leftSegments, base.leftSegments);
  assert.deepEqual(layered.rightSegments, base.rightSegments);
  assert.equal(layered.separator, base.separator);
  assert.equal(layered.signal?.animation, "hex-relay");
  assert.equal(layered.chrome?.frame, "square");
});

test("legacy layout presets keep their exact colors", () => {
  for (const name of Object.keys(PRESETS) as Array<keyof typeof PRESETS>) {
    const preset = PRESETS[name];
    const resolved = presetColorScheme(preset, getDefaultColors);
    assert.deepEqual(resolved, preset.colors ?? getDefaultColors(), name);
  }
});

test("completeMotionMap fills gaps from catalog defaults", () => {
  const partial = completeMotionMap({ streaming: "ember-relay" });
  assert.equal(partial.streaming, "ember-relay");
  assert.equal(partial.idle, "wisp");
  assert.equal(partial.compact, "bar");
});

test("liveColorScheme keeps layout colors until appearance is in effect", () => {
  const chef = PRESETS.chef;
  const live = liveColorScheme(chef, {}, "chef", getDefaultColors);
  assert.deepEqual(live, presetColorScheme(chef, getDefaultColors));
});

test("liveColorScheme uses structural tokens when appearance.base is set", () => {
  const chef = PRESETS.chef;
  const live = liveColorScheme(chef, { base: "hexforge" }, "chef", getDefaultColors);
  const mix = resolveAppearanceMix({ base: "hexforge" });
  assert.equal(live.model, mix.tokens.primary);
});

test("effectiveAppearanceMix treats a structural layout name as the base", () => {
  assert.deepEqual(effectiveAppearanceMix({}, "hexforge"), { base: "hexforge" });
  assert.deepEqual(effectiveAppearanceMix({ base: "wisp" }, "hexforge"), { base: "wisp" });
  assert.deepEqual(effectiveAppearanceMix({}, "chef"), {});
});
