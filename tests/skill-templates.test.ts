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
  editorCommandFor,
  parseSkillsNewArgs,
  renderSkillTemplate,
  runSkillsNew,
  sanitizeSkillName,
  writeSkillFromTemplate,
} from "../src/extension/skills/skill-templates.ts";
import { SKILL_TEMPLATE_GOLDEN } from "./fixtures/skill-template-golden.ts";

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

test("each template matches its golden rendered output", () => {
  for (const id of SKILL_TEMPLATE_IDS) {
    assert.equal(renderSkillTemplate(id, "demo-skill"), SKILL_TEMPLATE_GOLDEN[id], id);
  }
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
    const composed = writeSkillFromTemplate(
      "composed-skill",
      "standard",
      root,
      "---\nname: composed-skill\ndescription: From the wizard\n---\n\n# composed-skill\n",
    );
    assert.match(readFileSync(composed.filePath, "utf8"), /From the wizard/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function mockEditorCtx(initialText = "") {
  let editorText = initialText;
  const notifications: Array<{ message: string; level: string }> = [];
  const ctx = {
    ui: {
      getEditorText: () => editorText,
      setEditorText: (text: string) => {
        editorText = text;
      },
      notify: (message: string, level: string) => {
        notifications.push({ message, level });
      },
      custom: async () => ({ value: "cli-workflow", label: "CLI-workflow" }),
    },
  };
  return {
    ctx,
    getEditorText: () => editorText,
    notifications,
  };
}

test("runSkillsNew with a name appends the editor command without clearing existing text", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "skill-new-agent-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  const { ctx, getEditorText, notifications } = mockEditorCtx("draft prompt");
  try {
    await runSkillsNew(ctx, "demo-skill standard");
    const filePath = join(agentDir, "skills", "demo-skill", "SKILL.md");
    assert.equal(readFileSync(filePath, "utf8"), SKILL_TEMPLATE_GOLDEN.standard);
    assert.equal(
      getEditorText(),
      `draft prompt\n${editorCommandFor(filePath)}\n`,
    );
    assert.match(notifications.at(-1)?.message ?? "", /Created demo-skill/);
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    rmSync(agentDir, { recursive: true, force: true });
  }
});

test("runSkillsNew without a name appends the prefilled command after template pick", async () => {
  const { ctx, getEditorText, notifications } = mockEditorCtx("in-progress message");
  await runSkillsNew(ctx, "");
  assert.equal(
    getEditorText(),
    "in-progress message\n/skills new <name> cli-workflow\n",
  );
  assert.match(notifications.at(-1)?.message ?? "", /Replace <name>/);
});
