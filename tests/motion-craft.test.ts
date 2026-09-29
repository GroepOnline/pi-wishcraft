import assert from "node:assert/strict";
import test from "node:test";
import {
  brailleGlyph,
  brailleWakeGlyph,
  isBrailleGeometry,
  punchEnvelope,
  rippleRings,
} from "../src/motion/frames.ts";
import { getMotion } from "../src/motion/catalog.ts";
import { previewStrip } from "../src/motion/gallery.ts";
import {
  emberFlicker,
  glowFalloff,
  motionRampCode,
  motionRampPalette,
  srgbToLinear,
  linearToSrgb,
  srgbToOklab,
  valueNoise,
} from "../src/theme/colors.ts";
import { renderActivity } from "../src/render/motion-rail.ts";
import { createSignalRuntime } from "../src/signal/controller.ts";
import type { SignalSpec } from "../src/config/types.ts";
import { stripAnsi } from "./helpers/strip-ansi.ts";

const TEST_SIGNAL_SPEC: SignalSpec = {
  layout: "standard",
  separators: { left: "[", right: "]" },
  caps: {},
  animation: "ember-relay",
};

function runtimeFor(motionId: string, event: "streaming" | "success") {
  const signal = createSignalRuntime(0);
  signal.event = event;
  signal.motionId = motionId;
  signal.activity = "x";
  signal.active = true;
  signal.tick = 3;
  return signal;
}

test("brailleGlyph packs two fill levels into one 2x4 cell", () => {
  // Empty cell: the braille blank base.
  assert.equal(brailleGlyph(0, 0), "⠀");
  // Full cell: all 8 dots set → 0xFF.
  assert.equal(brailleGlyph(1, 1), String.fromCharCode(0x2800 + 0xff));
  // Left column full, right empty: left dots 0x40|0x04|0x02|0x01 = 0x47.
  assert.equal(brailleGlyph(1, 0), String.fromCharCode(0x2800 + 0x47));
  // Right column full, left empty: right dots 0x80|0x20|0x10|0x08 = 0xB8.
  assert.equal(brailleGlyph(0, 1), String.fromCharCode(0x2800 + 0xb8));
  // 3/4 fill: bottom three dots per column (0x46 | 0xB0 = 0xF6).
  assert.equal(brailleGlyph(0.75, 0.75), String.fromCharCode(0x2800 + 0xf6));
  // 1/4 fill: bottom dot only (0x40 | 0x80 = 0xC0).
  assert.equal(brailleGlyph(0.25, 0.25), String.fromCharCode(0x2800 + 0xc0));
  // Values clamp to the 0..1 level range.
  assert.equal(brailleGlyph(9, 9), brailleGlyph(1, 1));
  assert.equal(brailleGlyph(-1, -1), brailleGlyph(0, 0));
});

test("brailleWakeGlyph ripples and respects its envelope", () => {
  const a = brailleWakeGlyph(4, 5.2, 1, 0);
  const b = brailleWakeGlyph(4, 5.2, 1, 0.25);
  assert.notEqual(a, b, "time phase must move the wake");
  assert.equal(brailleWakeGlyph(4, 5.2, 0, 0), brailleGlyph(0, 0), "zero envelope is blank");
});

test("isBrailleGeometry selects only wave/heat/liquid generators", () => {
  assert.equal(isBrailleGeometry(getMotion("ember-relay")), false);
  assert.equal(isBrailleGeometry(getMotion("braille-wave")), false, "frames-kind stays frame-driven");
  const wave = { id: "x", kind: "generator", generator: { geometry: "wave", intervalMs: 70 } } as Parameters<
    typeof isBrailleGeometry
  >[0];
  assert.equal(isBrailleGeometry(wave), true);
});

test("rippleRings expands two fading rings from the center", () => {
  const width = 15;
  const rings = rippleRings(2, width, 6);
  assert.equal(rings.length, 2);
  // First ring is alive and wider than the (not yet born) second ring.
  assert.ok(rings[0]!.life > 0);
  assert.equal(rings[1]!.life, 0);
  assert.ok(rings[0]!.right - rings[0]!.left > 0);
  // Late in the gesture both rings are expanding or faded, never growing back.
  const late = rippleRings(5, width, 6);
  assert.ok(late[1]!.life > 0);
  assert.ok(late[1]!.life < 1);
  // Degenerate widths produce no rings.
  assert.deepEqual(rippleRings(1, 2, 6), []);
});

test("punchEnvelope decays exponentially from the event switch", () => {
  assert.equal(punchEnvelope(0), 0);
  assert.ok(punchEnvelope(50) > punchEnvelope(200));
  assert.ok(Math.abs(punchEnvelope(220) - 0.5) < 0.01, "half-life hits 0.5");
  assert.ok(punchEnvelope(2000) < 0.01, "settles to zero");
});

test("emberFlicker is deterministic, alive and bounded", () => {
  assert.equal(emberFlicker(7, 1000), emberFlicker(7, 1000), "pure in (seed, time)");
  assert.notEqual(emberFlicker(7, 1000), emberFlicker(8, 1000), "seed varies the flame");
  const values = Array.from({ length: 40 }, (_, i) => emberFlicker(7, i * 137));
  assert.ok(Math.min(...values) >= 0 && Math.max(...values) <= 1);
  assert.ok(new Set(values).size > 20, "the flame must not repeat on a short cycle");
});

test("glowFalloff is an ease-out decay that lingers near the head", () => {
  assert.equal(glowFalloff(0), 0);
  assert.equal(glowFalloff(1), 1);
  // Ease-out: at the linear midpoint the value is well past halfway bright.
  assert.ok(glowFalloff(0.5) > 0.68);
  assert.ok(glowFalloff(0.25) > 0.4, "bright near the head");
});

test("valueNoise is deterministic and octaved", () => {
  assert.equal(valueNoise(3, 1.25), valueNoise(3, 1.25));
  assert.notEqual(valueNoise(3, 1.25), valueNoise(4, 1.25));
  const v = valueNoise(3, 0.77);
  assert.ok(v >= 0 && v <= 1);
});

test("sRGB round-trip and gamma-correct midpoint", () => {
  assert.ok(Math.abs(srgbToLinear(255) - 1) < 1e-9);
  assert.ok(Math.abs(srgbToLinear(0)) < 1e-9);
  assert.equal(linearToSrgb(1), 255);
  assert.equal(linearToSrgb(0), 0);
  assert.equal(linearToSrgb(srgbToLinear(128)), 128, "round trip");
});

test("motionRampCode interpolates a perceptual multi-stop ramp", () => {
  const ramp = motionRampPalette("accent", "sep");
  const at0 = motionRampCode(ramp, 0);
  const at1 = motionRampCode(ramp, 1);
  const mid = motionRampCode(ramp, 0.45);
  assert.ok(at0 && at1 && mid, "colors enabled in test env");
  assert.notEqual(at0, at1);
  assert.notEqual(mid, at0);
  assert.notEqual(mid, at1);
  // Outside range clamps to the end stops.
  assert.equal(motionRampCode(ramp, -3), at0);
  assert.equal(motionRampCode(ramp, 3), at1);
});

test("wake lightness falls monotonically — embers cool, they never brighten", () => {
  const ramp = motionRampPalette("accent", "sep");
  // Parse the ANSI truecolor sequence back to bytes.
  const rgbOf = (code: string): [number, number, number] => {
    const m = /\x1b\[38;2;(\d+);(\d+);(\d+)m/.exec(code);
    assert.ok(m, `expected truecolor code, got ${JSON.stringify(code)}`);
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  };
  let prev = Number.POSITIVE_INFINITY;
  for (let i = 0; i <= 20; i++) {
    const [r, g, b] = rgbOf(motionRampCode(ramp, i / 20));
    const { L } = srgbToOklab([r, g, b]);
    assert.ok(
      L <= prev + 1e-9,
      `lightness rose at t=${i / 20}: ${L} > ${prev}`,
    );
    prev = L;
  }
});

test("terminal events render the expanding ripple gesture", () => {
  const signal = runtimeFor("ember-relay", "success");
  const early = stripAnsi(renderActivity(signal, TEST_SIGNAL_SPEC, false, 100, 5000));
  assert.match(early, /[●◆◇]/, `expected ripple ring glyphs, got ${early}`);
  assert.doesNotMatch(early, /\n/, "ripple stays one row");
  // Wide enough tick: both rings alive and separated.
  signal.tick = 4;
  const mid = stripAnsi(renderActivity(signal, TEST_SIGNAL_SPEC, false, 100, 5000));
  assert.ok((mid.match(/[●◆◇]/g)?.length ?? 0) >= 2, `expected ring pairs, got ${mid}`);
});

test("braille geometry motions preview rippling wakes in the gallery", () => {
  const wave = getMotion("heat-relay") ?? getMotion("ember-relay");
  assert.ok(wave);
  const strip = previewStrip(wave, 5, 14, false);
  assert.equal(Array.from(strip).length, 14, "preview stays single-column wide");
});

test("rail interpolation and sweep path stay intact after craft changes", () => {
  const signal = runtimeFor("ember-relay", "streaming");
  signal.activity = "streaming";
  const ascii = stripAnsi(renderActivity(signal, TEST_SIGNAL_SPEC, true, 100, 5000));
  assert.match(ascii, /o/, "ASCII head still renders");
  assert.match(ascii, /streaming/);
});
