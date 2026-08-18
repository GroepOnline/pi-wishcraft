#!/usr/bin/env node
// Catalog contract for pi.dev/packages. Fail closed before publish.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

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

assert(pkg.name === "@groeponline/pi-wishcraft", "unexpected package name");
assert(pkg.license === "MIT", "license must remain explicit");
assert(pkg.publishConfig?.access === "public", "scoped package must publish publicly");

const description = pkg.description ?? "";
assert(description.length >= 80, "description is too weak for catalog discovery");
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
const imageUrl = new URL(image);
assert(imageUrl.protocol === "https:", "pi.image must use HTTPS");
assert(imageUrl.pathname.endsWith(".png"), "pi.image must be a PNG");

console.log("Package catalog contract OK");
console.log(`  npm: https://www.npmjs.com/package/${pkg.name}`);
console.log(`  pi.dev: https://pi.dev/packages/${pkg.name}`);
console.log(`  search: https://pi.dev/packages?name=wishcraft`);
console.log(`  groeponline: https://pi.dev/packages?name=groeponline`);
