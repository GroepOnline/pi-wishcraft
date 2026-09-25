import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyAppearanceHit,
  applyAppearanceSelection,
  appearanceCatalog,
  nextAppearancePane,
  paneOptions,
  searchAppearanceConfig,
} from "../src/extension/ui/deck/appearance-search.ts";
import { getMotion } from "../src/motion/catalog.ts";
import { toggleFavorite } from "../src/motion/gallery.ts";

test("recovered motions are in the catalog and fat-band is addressable", () => {
  assert.ok(getMotion("ember-trail"));
  assert.ok(getMotion("fat-band"));
  assert.equal(getMotion("ember-trail")?.id, "ember-trail");
});

test("appearance search is search-first and applies live mix patches", () => {
  const catalog = appearanceCatalog();
  assert.ok(catalog.length > 50);
  const ember = searchAppearanceConfig("ember relay");
  assert.ok(ember.some((hit) => hit.value === "ember-relay"));
  const mix = applyAppearanceHit({}, ember.find((hit) => hit.kind === "motion")!);
  assert.equal(
    (mix.motion as { streaming?: string } | undefined)?.streaming,
    "ember-relay",
  );
  const lantern = applyAppearanceSelection({}, "presets", "lanternwake");
  assert.equal(lantern.base, "lanternwake");
  assert.equal(nextAppearancePane("presets"), "palette");
  assert.ok(paneOptions("motion").includes("ember-relay"));
  assert.ok(paneOptions("motion").includes("fat-band"));
});

test("favorites toggle is reversible", () => {
  const once = toggleFavorite([], "wisp");
  assert.deepEqual(once, ["wisp"]);
  assert.deepEqual(toggleFavorite(once, "wisp"), []);
});
