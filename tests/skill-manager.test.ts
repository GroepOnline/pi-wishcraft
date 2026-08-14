import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSkillFrontmatter } from "../src/core/frontmatter.ts";
import {
  listSkills,
  readSkillBody,
} from "../src/extension/skills/skill-manager.ts";

test("parseSkillFrontmatter extracts name and description", () => {
  const fm = parseSkillFrontmatter(`---
name: foo
description: Does the foo thing
---
body`);
  assert.equal(fm.name, "foo");
  assert.equal(fm.description, "Does the foo thing");
});

test("parseSkillFrontmatter returns nulls without frontmatter", () => {
  const fm = parseSkillFrontmatter("plain text");
  assert.equal(fm.name, null);
  assert.equal(fm.description, null);
});

test("readSkillBody strips frontmatter and trims", () => {
  const dir = mkdtempSync(join(tmpdir(), "skill-manager-"));
  const file = join(dir, "SKILL.md");
  writeFileSync(
    file,
    `---
name: bar
description: Bar
---

Het echte  body.
`,
  );
  assert.equal(readSkillBody(file), "Het echte  body.");
});

test("listSkills returns SkillInfo entries", () => {
  const skills = listSkills();
  assert.ok(Array.isArray(skills));
  for (const skill of skills) {
    assert.equal(typeof skill.name, "string");
    assert.ok(skill.path.length > 0);
  }
});
