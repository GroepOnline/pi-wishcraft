import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const readme = readFileSync(join(root, "README.md"), "utf8");

test("README keeps a stable package-catalog banner URL and drops the upstream screenshot", () => {
  assert.match(readme, /src="https:\/\/raw\.githubusercontent\.com\/GroepOnline\/pi-wishcraft\/main\/banner\.png"/);
  assert.doesNotMatch(
    readme,
    /user-attachments\/assets\/4cc43320-3fb8-4503-b857-69dffa7028f2/,
  );
  assert.doesNotMatch(readme, /user-attachments\/assets\//);
});

test("README is a landing page that points at docs and does not revive upstream claims", () => {
  assert.match(readme, /docs\/index\.md/);
  assert.match(readme, /pi install npm:@groeponline\/pi-wishcraft/);
  assert.match(readme, /hooksEnabled/);
  assert.doesNotMatch(readme, /rainbow effect inspired by Claude Code/);
  assert.doesNotMatch(readme, /Autonomous Horizons/);
  assert.ok(readme.split("\n").length < 250, "landing page should stay short");
});
