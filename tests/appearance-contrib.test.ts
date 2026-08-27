import assert from "node:assert/strict";
import test from "node:test";
import { getStructuralPreset } from "../src/config/structural-presets.ts";
import {
  clearAppearanceContributions,
  registerAppearanceContribution,
} from "../src/extension/contrib/appearance.ts";

test("appearance contribution merges tokens with fault isolation", () => {
  clearAppearanceContributions();
  const base = getStructuralPreset("lanternwake");
  assert.equal(base.tokens.primary, "#f59e0b");
  assert.equal(registerAppearanceContribution("lanternwake", { tokens: { primary: "#ff0000" } }), true);
  const patched = getStructuralPreset("lanternwake");
  assert.equal(patched.tokens.primary, "#ff0000");
  assert.equal(patched.tokens.accent, base.tokens.accent);
  clearAppearanceContributions();
  const restored = getStructuralPreset("lanternwake");
  assert.equal(restored.tokens.primary, "#f59e0b");
});

test("appearance contribution deep-merges partial signal and chrome patches", () => {
  clearAppearanceContributions();
  const base = getStructuralPreset("lanternwake");
  assert.equal(
    registerAppearanceContribution("lanternwake", {
      signal: { separators: { left: "<" }, caps: { rightClose: "]" } },
      chrome: { corners: { tl: "+" }, dividers: { vertical: "!" } },
    }),
    true,
  );
  const patched = getStructuralPreset("lanternwake");
  assert.equal(patched.signal.separators.left, "<");
  assert.equal(patched.signal.separators.right, base.signal.separators.right);
  assert.equal(patched.signal.caps.rightClose, "]");
  assert.equal(patched.signal.caps.leftOpen, base.signal.caps.leftOpen);
  assert.equal(patched.chrome.corners.tl, "+");
  assert.equal(patched.chrome.corners.tr, base.chrome.corners.tr);
  assert.equal(patched.chrome.dividers.vertical, "!");
  assert.equal(patched.chrome.dividers.horizontal, base.chrome.dividers.horizontal);
  clearAppearanceContributions();
});

test("appearance contribution rejects invalid input and preset identity overrides", () => {
  clearAppearanceContributions();
  // @ts-expect-error deliberate runtime-contract probe
  assert.equal(registerAppearanceContribution(null, {}), false);
  assert.equal(registerAppearanceContribution("lanternwake", null as unknown as Record<string, unknown>), false);
  const identityPatch = { name: "wisp" } as unknown as Parameters<
    typeof registerAppearanceContribution
  >[1];
  assert.equal(registerAppearanceContribution("lanternwake", identityPatch), false);
  assert.equal(getStructuralPreset("lanternwake").name, "lanternwake");
  clearAppearanceContributions();
});
