import assert from "node:assert/strict";
import { test } from "node:test";
import { MOTION_CATALOG } from "../src/motion/catalog.ts";
import {
  GALLERY_GROUPS,
  groupMotions,
  previewMotionFrames,
  previewMotionRail,
  searchMotions,
  toggleFavorite,
} from "../src/motion/gallery.ts";
import {
  composerTimeline,
  composerToMotion,
  cycleGeometry,
  draftFromId,
  draftFromMotion,
  patchComposerDraft,
  previewComposerFrames,
  toggleComposerChannel,
} from "../src/motion/composer.ts";
import {
  applyAppearanceHit,
  applyAppearanceSelection,
  appearanceCatalog,
  nextAppearancePane,
  paneOptions,
  searchAppearanceConfig,
} from "../src/extension/ui/deck/appearance.ts";

test("motion catalog has at least 50 definitions with unique ids and ASCII fallbacks", () => {
  assert.ok(MOTION_CATALOG.length >= 50, `catalog size ${MOTION_CATALOG.length}`);
  const ids = MOTION_CATALOG.map((motion) => motion.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const motion of MOTION_CATALOG) {
    assert.ok(motion.fallbackGlyph.length > 0, motion.id);
    assert.ok(motion.channels.length > 0, motion.id);
  }
});

test("gallery groups cover wishcraft, matrix, procedural, classic, favorites, custom", () => {
  assert.deepEqual([...GALLERY_GROUPS], [
    "wishcraft",
    "matrix",
    "procedural",
    "classic",
    "favorites",
    "custom",
  ]);
  const groups = groupMotions(["ember-relay"]);
  assert.ok(groups.wishcraft.length > 0);
  assert.ok(groups.matrix.length > 0);
  assert.ok(groups.procedural.length > 0);
  assert.ok(groups.classic.length > 0);
  assert.equal(groups.favorites[0]?.id, "ember-relay");
});

test("searchMotions matches name, id, and description", () => {
  const hits = searchMotions("ember");
  assert.ok(hits.some((motion) => motion.id === "ember-relay"));
  assert.equal(searchMotions("definitely-missing-motion").length, 0);
});

test("favorites toggle is reversible", () => {
  const once = toggleFavorite([], "wisp");
  assert.deepEqual(once, ["wisp"]);
  assert.deepEqual(toggleFavorite(once, "wisp"), []);
});

test("gallery preview frames and rails stay width-stable", () => {
  const ember = MOTION_CATALOG.find((motion) => motion.id === "ember-relay");
  assert.ok(ember);
  const frames = previewMotionFrames(ember, 4, true);
  assert.deepEqual(frames, ["*", "*", "*", "*"]);
  const rail = previewMotionRail(ember, 2, 12, true);
  assert.equal(rail.length, 12);
});

test("composer drafts preview and assign channels", () => {
  const draft = draftFromId("ember-relay");
  assert.ok(draft);
  const patched = patchComposerDraft(draft, { intervalMs: 10, trail: 99 });
  assert.equal(patched.intervalMs, 50);
  assert.equal(patched.trail, 8);
  const withChannel = toggleComposerChannel(patched, "ambient");
  assert.ok(withChannel.channels.includes("ambient"));
  const frames = previewComposerFrames(draftFromMotion(emberDef()), 3, true);
  assert.equal(frames.length, 3);
  assert.match(composerTimeline(draft, 3), /ms:/);
  assert.equal(composerToMotion(draft).category, "custom");
  assert.equal(cycleGeometry("ember"), "stitch");
});

function emberDef() {
  return MOTION_CATALOG.find((motion) => motion.id === "ember-relay")!;
}

test("appearance search is search-first and applies live mix patches", () => {
  const catalog = appearanceCatalog();
  assert.ok(catalog.length > 50);
  const ember = searchAppearanceConfig("ember relay");
  assert.ok(ember.some((hit) => hit.value === "ember-relay"));
  const mix = applyAppearanceHit({}, ember.find((hit) => hit.kind === "motion")!);
  assert.equal((mix.motion as { streaming?: string })?.streaming, "ember-relay");
  const lantern = applyAppearanceSelection({}, "presets", "lanternwake");
  assert.equal(lantern.base, "lanternwake");
  assert.equal(nextAppearancePane("presets"), "palette");
  assert.ok(paneOptions("motion").includes("ember-relay"));
});
