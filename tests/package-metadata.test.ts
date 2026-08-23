import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");

function runVerify(args: string[] = []) {
  return spawnSync(process.execPath, ["scripts/verify-package.mjs", ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

test("verify:package accepts the catalog contract", () => {
  const result = runVerify();
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Package catalog contract OK/);
});

test("verify:package rejects a manifest missing a discovery keyword", () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-wishcraft-verify-"));
  try {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    pkg.keywords = (pkg.keywords ?? []).filter(
      (keyword: string) => keyword !== "wishcraft",
    );
    const manifestPath = join(dir, "package.json");
    writeFileSync(manifestPath, JSON.stringify(pkg));

    const result = runVerify([manifestPath]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /missing discovery keyword wishcraft/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
