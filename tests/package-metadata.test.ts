import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

test("verify:package accepts the catalog contract", () => {
  const result = spawnSync(process.execPath, ["scripts/verify-package.mjs"], {
    cwd: join(import.meta.dirname, ".."),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Package catalog contract OK/);
});
