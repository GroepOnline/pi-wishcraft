import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const roadmap = readFileSync(join(root, "ROADMAP.md"), "utf8");

test("ROADMAP header reflects the sixth pass and the 0.19.0-0.22.2 npm range", () => {
  assert.match(roadmap, /Zesde pass 2026-08-20/);
  assert.match(roadmap, /0\.19\.0–0\.22\.2 staan\nop npm/);
  assert.doesNotMatch(roadmap, /Vijfde pass/);
});

test("ROADMAP header states the 0.20-0.22 harness is done and points at the 1.0 cockpit parent", () => {
  assert.match(roadmap, /0\.20–0\.22 harness is Done/);
  assert.match(roadmap, /GRO-1415 en children GRO-1416–1421/);
  assert.doesNotMatch(
    roadmap,
    /ROADMAP was achter op de code: hooks,\nrepairs-subset en skills-manager v2 UI zitten al op `main`\./,
  );
});

test("Milestones section reflects the harness npm range and lists 1.0 cockpit deliverables", () => {
  assert.match(roadmap, /\*\*0\.20\.0–0\.22 — "Harness"\*\* \(0\.20\.0–0\.22\.2 op npm\)/);
  assert.match(roadmap, /CHE-41 snapshot-detail, test-determinism/);
  assert.match(
    roadmap,
    /\*\*1\.0 — "Cockpit"\*\* \(open: GRO-1415\)\. Skills-doctor, templates, policy,/,
  );
  assert.match(roadmap, /Preset-editor en\n {2}CHE-41 zijn al op `main`/);
  // Superseded phrasing from the previous pass must be gone.
  assert.doesNotMatch(roadmap, /leftovers in GRO-1414/);
});

test("skill manager v2 UI section is in English, not Dutch", () => {
  assert.match(roadmap, /Same chrome as the segment navigator\. English, direct\./);
  assert.doesNotMatch(roadmap, /Zelfde chrome als de segment-navigator\. Nederlands, direct\./);
});

test("1.0 Cockpit section describes the campaign as lettered PRs with locked English-only defaults", () => {
  assert.match(
    roadmap,
    /0\.20–0\.22 zijn geland\. Geen parallelle 1\.0-tak naast harness-werk;/,
  );
  assert.match(roadmap, /Locked defaults \(no human gate\): operator UI, overlays, notify/);
  assert.match(roadmap, /strings, and ROADMAP are \*\*English\*\* \(no Dutch copy\)/);
  assert.match(roadmap, /description\nbudget 240 characters/);

  for (const heading of [
    /### PR I — `\/skills doctor` \(GRO-1416\) → 0\.23\.0/,
    /### PR J — `\/skills new` templates \(GRO-1417\) → 0\.24\.0/,
    /### PR K — policy engine \(GRO-1418\) → 0\.25\.0/,
    /### PR L — idee-review \(GRO-1419\) → 0\.26\.0/,
    /### PR M — keys, read-hints, Status-trim \(GRO-1420\) → 0\.27\.0/,
    /### PR N — 1\.0\.0 cut \(GRO-1421\)/,
  ]) {
    assert.match(roadmap, heading);
  }

  // The old numbered 1.0 task list (pre-lettered-PR plan) should be gone.
  assert.doesNotMatch(roadmap, /Pas na 0\.20\. Geen parallelle 1\.0-tak\./);
  assert.doesNotMatch(roadmap, /\*\*`\/skills doctor`\*\* — kapot frontmatter/);
});

test("1.0 Cockpit section marks preset editor and per-segment detail as already shipped", () => {
  assert.match(roadmap, /Al geland, niet opnieuw bouwen:/);
  assert.match(roadmap, /\*\*Preset editor\*\* ✅ `runPresetEditor` in Configure \(`alt\+p`\)\./);
  assert.match(roadmap, /\*\*Per-segment detail\*\* \(CHE-41\) ✅ `→` in Navigate, snapshot/);
});

test("Linear table lists the new GRO-1415..1422 tickets with their PR mapping", () => {
  const expectedRows = [
    /\| GRO-1415 1\.0 parent \| In Progress\. Cockpit-campagne\. \|/,
    /\| GRO-1416 `\/skills doctor` \| PR I\. \|/,
    /\| GRO-1417 `\/skills new` \| PR J, blocked on 1416\. \|/,
    /\| GRO-1418 policy \| PR K\. \|/,
    /\| GRO-1419 idee-review \| PR L\. \|/,
    /\| GRO-1420 keys \+ hints \+ Status \| PR M\. \|/,
    /\| GRO-1421 1\.0\.0 cut \| PR N, blocked on 1416–1420\. \|/,
    /\| GRO-1422 English-only UI \| PR EN\. Operator overlays and ROADMAP in English\. \|/,
  ];
  for (const row of expectedRows) {
    assert.match(roadmap, row);
  }
});

test("Checklist (1.0) section lists the six open PRs as unchecked", () => {
  const checklistIndex = roadmap.indexOf("## Checklist (1.0)");
  assert.notEqual(checklistIndex, -1, "Checklist (1.0) section should exist");
  const checklistSection = roadmap.slice(checklistIndex);

  const items = [
    /- \[ \] PR EN gemerged: operator UI\/overlays\/ROADMAP English\. \(GRO-1422\)/,
    /- \[ \] PR J gemerged: vier templates, geen markt\. \(GRO-1417\)/,
    /- \[ \] PR K gemerged: deny `sudo rm` \+ inject `\.env` zonder spawn\. \(GRO-1418\)/,
    /- \[ \] PR L gemerged: idee-review overlay\. \(GRO-1419\)/,
    /- \[ \] PR M gemerged: `skills\.count`, read-hints-of-skip, Status-trim\. \(GRO-1420\)/,
    /- \[ \] PR N: README waar, `npm view` = 1\.0\.0\. \(GRO-1421\)/,
  ];
  for (const item of items) {
    assert.match(checklistSection, item);
  }

  // None of the 1.0 checklist items should be marked done yet.
  assert.doesNotMatch(checklistSection, /- \[x\]/);
});

test("Checklist (1:1 met 0.19) section is unchanged and still fully checked", () => {
  const checklistIndex = roadmap.indexOf("## Checklist (1:1 met 0.19)");
  const nextSectionIndex = roadmap.indexOf("## Checklist (1.0)");
  assert.notEqual(checklistIndex, -1);
  assert.notEqual(nextSectionIndex, -1);
  const section = roadmap.slice(checklistIndex, nextSectionIndex);
  // Every checklist line in the 0.19 section should be checked ([x]).
  const checklistLines = section.split("\n").filter((line) => /^- \[[ x]\]/.test(line));
  assert.ok(checklistLines.length > 0, "expected at least one checklist line");
  for (const line of checklistLines) {
    assert.match(line, /^- \[x\]/);
  }
});