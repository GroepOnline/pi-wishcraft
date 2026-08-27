import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWorkbenchSkills } from "../src/extension/skills/workbench-catalog.ts";
import { invalidateSkillCache } from "../src/extension/skills/skill-registry.ts";

test("loadWorkbenchSkills includes body preview, triggers, and a usage series", () => {
  const cwd = mkdtempSync(join(tmpdir(), "wb-catalog-"));
  const skillDir = join(cwd, "skills", "catalog-demo");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, "SKILL.md"),
    `---
name: catalog-demo
description: Demo skill for the workbench catalog
---

# catalog-demo

Visible preview line.

## Triggers

- $catalog-demo
`,
  );
  try {
    invalidateSkillCache();
    const skills = loadWorkbenchSkills(cwd);
    const demo = skills.find((skill) => skill.name === "catalog-demo");
    assert.ok(demo, "catalog-demo should be discovered");
    assert.match(demo.bodyPreview ?? "", /Visible preview line/);
    assert.deepEqual(demo.triggers, ["$catalog-demo"]);
    assert.equal(demo.filePath, join(skillDir, "SKILL.md"));
    assert.ok(Array.isArray(demo.usageSeries));
  } finally {
    invalidateSkillCache();
    rmSync(cwd, { recursive: true, force: true });
  }
});
