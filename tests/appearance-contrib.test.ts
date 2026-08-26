import assert from "node:assert/strict";
import test from "node:test";
import { getStructuralPreset } from "../src/config/structural-presets.ts";
import {
  clearAppearanceContributions,
  registerAppearanceContribution,
} from "../src/extension/contrib/appearance.ts";

test("appearance contribution merges tokens and signal with fault isolation", () => {
  clearAppearanceContributions();
  const base = getStructuralPreset("lanternwake");
  assert.equal(base.tokens.primary, "#f59e0b");
  assert.equal(registerAppearanceContribution("lanternwake", { tokens: { primary: "#ff0000" } }), true);
  const patched = getStructuralPreset("lanternwake");
  assert.equal(patched.tokens.primary, "#ff0000");
  assert.equal(patched.tokens.accent, base.tokens.accent); // other tokens preserved
  clearAppearanceContributions();
  const restored = getStructuralPreset("lanternwake");
  assert.equal(restored.tokens.primary, "#f59e0b");
});

test("appearance contribution rejects invalid preset or patch", () => {
  clearAppearanceContributions();
  // @ts-expect-error
  assert.equal(registerAppearanceContribution(null, {}), false);
  assert.equal(registerAppearanceContribution("lanternwake", null as unknown as Record<string, unknown>), false);
  clearAppearanceContributions();
});
