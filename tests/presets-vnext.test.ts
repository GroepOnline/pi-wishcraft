/**
 * tests/presets-vnext.test.ts
 * ---------------------------------------------------------------------------
 * Test suite for the 10 structural presets and semantic token derivations.
 * ---------------------------------------------------------------------------
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { PRESETS, getPreset } from "../src/config/presets.ts";
import { createTokens, deriveColorSchemeFromTokens } from "../src/theme/tokens/mapping.ts";

describe("Wishcraft vNext Structural Presets & Tokens", () => {
  it("registers all 10 signature structural presets alongside built-ins", () => {
    const vNextPresets = [
      "lanternwake",
      "threadbound",
      "scryglass",
      "runebloom",
      "moonwell",
      "hexforge",
      "vellum",
      "wisp",
      "starweave",
      "crucible",
    ];

    for (const name of vNextPresets) {
      assert.ok(Object.prototype.hasOwnProperty.call(PRESETS, name), `Missing preset: ${name}`);
      const def = getPreset(name);
      assert.ok(def.leftSegments.length > 0);
      assert.ok(def.tokens !== undefined, `Preset ${name} must define tokens`);
    }
  });

  it("correctly maps tokens to legacy ColorScheme", () => {
    const tokens = createTokens({
      primary: "#123456",
      secondary: "#abcdef",
      accent: "#ff007f",
    });

    const scheme = deriveColorSchemeFromTokens(tokens);
    assert.equal(scheme.model, "#123456");
    assert.equal(scheme.path, "#abcdef");
    assert.equal(scheme.shellMode, "#ff007f");
  });
});
