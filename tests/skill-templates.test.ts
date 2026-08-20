import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseSkillFrontmatter } from "../src/core/frontmatter.ts";
import { SKILL_DESCRIPTION_MAX_CHARS } from "../src/extension/skills/skill-doctor.ts";
import {
  SKILL_TEMPLATE_IDS,
  buildSkillTemplateItems,
  parseSkillsNewArgs,
  renderSkillTemplate,
  sanitizeSkillName,
  writeSkillFromTemplate,
} from "../src/extension/skills/skill-templates.ts";

test("sanitizeSkillName rejects empty, traversal, and separators", () => {
  assert.throws(() => sanitizeSkillName(""), /required/);
  assert.throws(() => sanitizeSkillName("   "), /required/);
  assert.throws(() => sanitizeSkillName(".."), /traversal/);
  assert.throws(() => sanitizeSkillName("../etc"), /traversal/);
  assert.throws(() => sanitizeSkillName("foo/bar"), /separators/);
  assert.throws(() => sanitizeSkillName("foo\\bar"), /separators/);
  assert.throws(() => sanitizeSkillName("Has Caps"), /lowercase/);
  assert.equal(sanitizeSkillName("My_Skill"), "my-skill");
  assert.equal(sanitizeSkillName("ports-probe"), "ports-probe");
});

test("parseSkillsNewArgs reads name and template with standard default", () => {
  assert.deepEqual(parseSkillsNewArgs(""), { template: "standard" });
  assert.deepEqual(parseSkillsNewArgs("new"), { template: "standard" });
  assert.deepEqual(parseSkillsNewArgs("new browser-workflow"), {
    template: "browser-workflow",
  });
  assert.deepEqual(parseSkillsNewArgs("new ports-probe cli-workflow"), {
    name: "ports-probe",
    template: "cli-workflow",
  });
  assert.deepEqual(parseSkillsNewArgs("ports-probe"), {
    name: "ports-probe",
    template: "standard",
  });
  assert.throws(() => parseSkillsNewArgs("new foo mystery"), /Unknown template/);
});

test("each template is a SKILL.md with a description under the 240-char budget", () => {
  for (const id of SKILL_TEMPLATE_IDS) {
    const body = renderSkillTemplate(id, "demo-skill");
    const fm = parseSkillFrontmatter(body);
    assert.equal(fm.name, "demo-skill");
    assert.ok(fm.description);
    assert.ok(fm.description.length <= SKILL_DESCRIPTION_MAX_CHARS, id);
    assert.match(body, /^---\nname: demo-skill\n/m);
  }
});

test("buildSkillTemplateItems lists all four templates including CLI-workflow", () => {
  const items = buildSkillTemplateItems();
  assert.deepEqual(
    items.map((item) => item.value),
    ["standard", "browser-workflow", "cli-workflow", "review-checklist"],
  );
  assert.equal(
    items.find((item) => item.value === "cli-workflow")?.label,
    "CLI-workflow",
  );
});

test("writeSkillFromTemplate writes SKILL.md and refuses overwrite and traversal", () => {
  const root = mkdtempSync(join(tmpdir(), "skill-templates-"));
  try {
    const { filePath } = writeSkillFromTemplate("demo-skill", "standard", root);
    assert.equal(filePath, join(root, "demo-skill", "SKILL.md"));
    const written = readFileSync(filePath, "utf8");
    assert.match(written, /name: demo-skill/);
    assert.throws(
      () => writeSkillFromTemplate("demo-skill", "standard", root),
      /already exists/,
    );
    assert.throws(
      () => writeSkillFromTemplate("..", "standard", root),
      /traversal/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
