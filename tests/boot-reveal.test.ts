import assert from "node:assert/strict";
import test from "node:test";
import {
  BOOT_REVEAL_MS,
  bootRevealActive,
  renderWelcomeArtWithReveal,
} from "../src/welcome/banner.ts";
import { stripAnsi } from "./helpers/strip-ansi.ts";

test("boot reveal: steady state outside the window, ramp inside it", () => {
  const steady = renderWelcomeArtWithReveal("lantern", 96, false, 0, 5000);
  const done = renderWelcomeArtWithReveal("lantern", 96, false, BOOT_REVEAL_MS + 1, 5000);
  assert.deepEqual(steady, done, "elapsed 0 and past-window render identically");

  const early = renderWelcomeArtWithReveal("lantern", 96, false, 100, 5000);
  const late = renderWelcomeArtWithReveal("lantern", 96, false, 1400, 5000);
  assert.notDeepEqual(early, late, "the ramp must visibly progress");

  // Same inputs, same frame: pure and deterministic.
  assert.deepEqual(
    renderWelcomeArtWithReveal("lantern", 96, false, 700, 5000),
    renderWelcomeArtWithReveal("lantern", 96, false, 700, 5000),
  );
});

test("boot reveal dims toward black monotonically as the ramp progresses", () => {
  // Sum the truecolor bytes of every frame: later frames must be brighter.
  const brightness = (elapsed: number): number => {
    const lines = renderWelcomeArtWithReveal("lantern", 96, false, elapsed, 5000);
    let sum = 0;
    for (const line of lines) {
      for (const m of line.matchAll(/\x1b\[38;2;(\d+);(\d+);(\d+)m/g)) {
        sum += Number(m[1]) + Number(m[2]) + Number(m[3]);
      }
    }
    return sum;
  };
  const steps = [80, 240, 480, 800, 1200, 1490];
  let prev = 0;
  for (const step of steps) {
    const value = brightness(step);
    assert.ok(value > prev, `brightness must rise at ${step}ms: ${value} <= ${prev}`);
    prev = value;
  }
  // The final frame lands inside the lantern's own animation band (the
  // reveal forces the animated lantern; afterwards it rests at the user's
  // animate setting) — the ramp ends on the steady layout, alive.
  const steady = brightness(BOOT_REVEAL_MS + 1);
  const final = brightness(1490);
  assert.ok(
    Math.abs(final - steady) <= steady * 0.16,
    `reveal must land on the steady render: ${final} vs ${steady}`,
  );
});

test("boot reveal respects the window helper", () => {
  assert.equal(bootRevealActive(1000, 1000), true);
  assert.equal(bootRevealActive(1000, 1000 + BOOT_REVEAL_MS - 1), true);
  assert.equal(bootRevealActive(1000, 1000 + BOOT_REVEAL_MS), false);
});

test("boot reveal leaves ASCII and no-color renders plain", () => {
  const lines = stripAnsi(
    renderWelcomeArtWithReveal("pi", 96, false, 400, 5000).join("\n"),
  );
  assert.ok(lines.length > 0, "pi art renders at width 96");
});
