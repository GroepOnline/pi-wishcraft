import assert from "node:assert/strict";
import { test } from "node:test";
import { MOTION_CATALOG } from "../src/motion/catalog.ts";
import {
  filterMotions,
  groupMotions,
  motionFrameCount,
  previewStrip,
} from "../src/motion/gallery.ts";
import {
  composerPreview,
  draftFromMotion,
  motionFromDraft,
  nudgeComposer,
} from "../src/motion/composer.ts";
import { getMotion } from "../src/motion/catalog.ts";

test("catalog ships fifty-plus gallery motions across the named families", () => {
  assert.ok(MOTION_CATALOG.length >= 50, `catalog size ${MOTION_CATALOG.length}`);
  const groups = groupMotions(MOTION_CATALOG);
  assert.ok(groups.wishcraft.length >= 8);
  assert.ok(groups.matrix.length >= 4);
  assert.ok(groups.procedural.length >= 4);
  assert.ok(groups.classic.length >= 4);
});

test("filterMotions is fuzzy over id, name, and category", () => {
  const lunar = filterMotions("lunar");
  assert.ok(lunar.some((motion) => motion.id.includes("lunar")));
  assert.equal(filterMotions("no-such-motion-xyz").length, 0);
  assert.equal(filterMotions("").length, MOTION_CATALOG.length);
});

test("clock motion uses ASCII-safe frames", () => {
  const clock = getMotion("clock");
  assert.ok(clock);
  assert.deepEqual(clock.frames, ["o", "O", "0", "O"]);
  assert.ok(!(clock.frames ?? []).some((frame) => /[\u{1F300}-\u{1FAFF}]/u.test(frame)));
});

test("previewStrip paints a travelling head", () => {
  const ember = getMotion("ember-relay");
  assert.ok(ember);
  const strip = previewStrip(ember, 3, 16);
  assert.equal(strip.length >= 8, true);
  assert.notEqual(strip, "-".repeat(16));
});

test("composer draft round-trips and nudges interval", () => {
  const ember = getMotion("ember-relay");
  assert.ok(ember);
  const draft = draftFromMotion(ember, "thinking");
  assert.equal(draft.assignEvent, "thinking");
  const nudged = nudgeComposer(draft, "intervalMs", 1);
  assert.ok(nudged.intervalMs > draft.intervalMs);
  const def = motionFromDraft(nudged);
  assert.equal(def.category, "custom");
  assert.equal(def.generator?.intervalMs, nudged.intervalMs);
  assert.ok(composerPreview(nudged, 0, 12).length >= 8);
  assert.ok(motionFrameCount(ember) > 0);
});
