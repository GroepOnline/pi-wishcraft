#!/usr/bin/env node
// Catalog contract for pi.dev/packages. Fail closed before publish.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = process.argv[2] ?? join(root, "package.json");

function loadManifest() {
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    const reason = error instanceof Error ? error.message : error;
    throw new Error(`Package metadata check failed: could not read ${manifestPath}: ${reason}`);
  }
}

const CANONICAL_REPOSITORY = "https://github.com/GroepOnline/pi-wishcraft";
const CANONICAL_IMAGE =
  "https://raw.githubusercontent.com/GroepOnline/pi-wishcraft/main/banner.png";
const REQUIRED_KEYWORDS = [
  "pi-package",
  "pi-extension",
  "pi-coding-agent",
  "wishcraft",
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Package metadata check failed: ${message}`);
  }
}

function verify() {
  const pkg = loadManifest();
  assert(pkg.name === "@groeponline/pi-wishcraft", "unexpected package name");
  assert(pkg.license === "MIT", "license must remain explicit");
  assert(pkg.publishConfig?.access === "public", "scoped package must publish publicly");

  const description = pkg.description ?? "";
  if (description.length < 80) {
    console.warn(
      `Warning: description is ${description.length} chars; aim for >= 80 for catalog discovery`,
    );
  }
  assert(description.length <= 180, "description is too long for catalog cards");

  for (const keyword of REQUIRED_KEYWORDS) {
    assert(pkg.keywords?.includes(keyword), `missing discovery keyword ${keyword}`);
  }

  const repositoryUrl =
    typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url ?? "";
  const normalizedRepository = repositoryUrl
    .replace(/^git\+/, "")
    .replace(/\.git$/, "")
    .replace(/\/$/, "");
  assert(
    normalizedRepository === CANONICAL_REPOSITORY,
    "repository must point at GroepOnline/pi-wishcraft",
  );

  assert(
    Array.isArray(pkg.pi?.extensions) && pkg.pi.extensions.includes("./index.ts"),
    "pi.extensions must declare ./index.ts",
  );

  const image = pkg.pi?.image;
  assert(image === CANONICAL_IMAGE, "pi.image must use the canonical banner.png URL");

  return pkg;
}

let pkg;
try {
  pkg = verify();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

console.log("Package catalog contract OK");
console.log(`  npm: https://www.npmjs.com/package/${pkg.name}`);
console.log(`  pi.dev: https://pi.dev/packages/${pkg.name}`);
console.log(`  search: https://pi.dev/packages?name=wishcraft`);
console.log(`  groeponline: https://pi.dev/packages?name=groeponline`);
