import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

test("operator UI modules do not ship Dutch overlay copy", () => {
  const sources = [
    read("src/extension/skills/skill-manager.ts"),
    read("src/extension/skills/skill-registry.ts"),
    read("src/extension/ui/overlay-chrome.ts"),
    read("src/extension/settings/wishcraft-config.ts"),
    read("src/extension/ui/deck/render.ts"),
    read("src/extension/ui/deck/component.ts"),
  ].join("\n");

  assert.doesNotMatch(sources, /geen skills voor/i);
  assert.doesNotMatch(sources, /geen match voor/i);
  assert.doesNotMatch(sources, /opgeslagen/);
  assert.doesNotMatch(sources, /verwijderen/);
  assert.doesNotMatch(sources, /bewerken/);
  assert.doesNotMatch(sources, /ingevoegd/);
  assert.doesNotMatch(sources, /Nederlands/i);
  assert.match(sources, /No skills for/);
  assert.match(sources, /no match for/);
  assert.match(sources, /Wishcraft Deck|ACTIVE ROUTE|Appearance/);
});
