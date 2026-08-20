import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const docsIndex = readFileSync(join(root, "docs", "index.md"), "utf8");

test("docs/index.md Planning section points at the 1.0 cockpit campaign", () => {
  assert.match(
    docsIndex,
    /\[ROADMAP\.md\]\(\.\.\/ROADMAP\.md\) — 1\.0 cockpit campaign \(GRO-1415\)\. 0\.19 Correctheid and 0\.20–0\.22 harness are shipped\./,
  );
});

test("docs/index.md no longer describes the roadmap as leftover 0.20 / 1.0 work", () => {
  assert.doesNotMatch(
    docsIndex,
    /release campaigns and leftover 0\.20 \/ 1\.0 work\./,
  );
});

test("docs/index.md keeps the README-is-landing-page framing and guide links intact", () => {
  assert.match(
    docsIndex,
    /The README is the public landing page \(`banner\.png` only\)\. Everything below lives here\./,
  );
  assert.match(docsIndex, /^## Guides$/m);
  assert.match(docsIndex, /^## Planning$/m);
  assert.match(docsIndex, /\[Commands & interactivity\]\(\.\/commands\.md\)/);
  assert.match(docsIndex, /\[Configuration\]\(\.\/configuration\.md\)/);
  assert.match(docsIndex, /\[Skill manager\]\(\.\/skill-manager\.md\)/);
});

test("docs/index.md Planning section has exactly one roadmap link", () => {
  const planningIndex = docsIndex.indexOf("## Planning");
  assert.notEqual(planningIndex, -1, "Planning section should exist");
  const planningSection = docsIndex.slice(planningIndex);
  const roadmapLinks = planningSection.match(/\[ROADMAP\.md\]/g) ?? [];
  assert.equal(roadmapLinks.length, 1);
});

test("docs/index.md stays a short, single-screen landing page", () => {
  assert.ok(
    docsIndex.split("\n").length < 30,
    "docs index should stay a short pointer page, not grow into a full doc",
  );
});