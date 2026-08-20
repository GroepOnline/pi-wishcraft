import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const readme = readFileSync(join(root, "README.md"), "utf8");

test("README lists the 1.0 cockpit surfaces", () => {
  assert.match(readme, /\/skills doctor/);
  assert.match(readme, /\/skills new/);
  assert.match(readme, /wishcraft\.policyEnabled/);
  assert.match(readme, /\/ideas/);
  assert.match(readme, /banner\.png/);
});
