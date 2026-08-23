import assert from "node:assert/strict";
import { test } from "node:test";
import { detectEnvironment, motionLevelFromEnv } from "../src/theme/detect.ts";
import {
  describePolicy,
  idleFps,
  isMotionLevel,
  policyFromEnvironment,
} from "../src/motion/accessibility.ts";
import { allowedChannels, effectiveLevel, targetFps } from "../src/motion/policy.ts";

test("detectEnvironment honors NO_COLOR, dumb TERM, and screen-reader flags", () => {
  const env = detectEnvironment({
    NO_COLOR: "1",
    TERM: "dumb",
    WISHCRAFT_SCREEN_READER: "1",
    WISHCRAFT_REDUCED_MOTION: "1",
  });
  assert.equal(env.noColor, true);
  assert.equal(env.dumb, true);
  assert.equal(env.screenReader, true);
  assert.equal(env.reducedMotion, true);
});

test("policyFromEnvironment forces off for screen readers and 0 FPS idle", () => {
  const policy = policyFromEnvironment(
    { WISHCRAFT_SCREEN_READER: "1", WISHCRAFT_MOTION: "full" },
    "full",
  );
  assert.equal(policy.screenReader, true);
  assert.equal(policy.level, "off");
  assert.equal(idleFps(policy), 0);
  assert.deepEqual(allowedChannels("streaming", policy), []);
});

test("WISHCRAFT_MOTION overrides a persisted full level", () => {
  const policy = policyFromEnvironment({ WISHCRAFT_MOTION: "functional" }, "full");
  assert.equal(policy.level, "functional");
  assert.equal(effectiveLevel(policy), "functional");
  assert.ok(isMotionLevel("reduced"));
  assert.equal(motionLevelFromEnv({ WISHCRAFT_MOTION: "off" }), "off");
});

test("reduced motion drops continuous signal sweeps", () => {
  const policy = policyFromEnvironment({ PREFER_REDUCED_MOTION: "1" }, "full");
  assert.equal(policy.reducedMotion, true);
  assert.equal(effectiveLevel(policy), "reduced");
  assert.ok(!allowedChannels("streaming", policy).includes("signal"));
  assert.equal(targetFps(policy, ["workingGlyph"], ["workingGlyph"]), 3);
  assert.match(describePolicy(policy), /reduced/);
});
