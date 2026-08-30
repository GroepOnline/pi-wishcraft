import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const readme = readFileSync(join(root, "README.md"), "utf8");

function lineContaining(fragment: string): string {
  const line = readme
    .split("\n")
    .find((candidate) => candidate.includes(fragment));
  assert.ok(line, `README should contain a line with ${JSON.stringify(fragment)}`);
  return line;
}

test("README lists the 1.0 cockpit surfaces", () => {
  assert.match(readme, /\/skills doctor/);
  assert.match(readme, /\/skills new/);
  assert.match(readme, /wishcraft\.policyEnabled/);
  assert.match(readme, /\/ideas/);
  assert.match(readme, /banner\.png/);
});

test("README defines the portfolio handoff from ideas to orchestration", () => {
  const boundary = lineContaining("Portfolio boundary:");

  assert.match(
    boundary,
    /Wishcraft owns the operator cockpit and lightweight idea capture/,
  );
  assert.ok(
    boundary.includes(
      "[`pi-missions`](https://github.com/GroepOnline/pi-missions)",
    ),
    "portfolio boundary should link to pi-missions",
  );
  assert.ok(
    boundary.includes(
      "[`pi-agent-orchestrator`](https://github.com/GroepOnline/pi-agent-orchestrator)",
    ),
    "portfolio boundary should link to pi-agent-orchestrator",
  );
  assert.match(boundary, /`idea -> mission -> orchestration run`/);
  assert.ok(
    boundary.indexOf("pi-missions") < boundary.indexOf("pi-agent-orchestrator"),
    "durable work should be promoted to a mission before orchestration",
  );
});

test("README does not present the portfolio boundary as a bundled v2 platform", () => {
  assert.doesNotMatch(readme, /^## v2 Platform \(in this release\)$/m);
});

test("README documents local state and opt-in external boundaries", () => {
  const boundary = lineContaining("Privacy/network boundary:");

  for (const localState of [
    "ideas",
    "settings",
    "usage ledgers",
    "normal cockpit state",
  ]) {
    assert.match(boundary, new RegExp(`\\b${localState}\\b`));
  }
  assert.match(boundary, /stay local/);
  assert.match(boundary, /no package-owned telemetry backend/);
  assert.match(boundary, /Optional exchange-rate\/DeepWiki features/);
  assert.match(boundary, /operator-defined hooks/);
  assert.match(boundary, /only when used/);
});

test("README exposes status keys as compatibility API without branded coupling", () => {
  const compatibility = lineContaining("Compatibility status keys");

  for (const key of ["powerline.preset", "powerline.tps", "powerline.ports"]) {
    assert.ok(
      compatibility.includes(`\`${key}\``),
      `compatibility boundary should name ${key}`,
    );
  }
  assert.match(compatibility, /available to peer extensions/);
  assert.match(compatibility, /normal Wishcraft use does not require them/);
  assert.doesNotMatch(readme, /ChefGroep status keys/);
});
