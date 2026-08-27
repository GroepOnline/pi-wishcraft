import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  advanceWizard,
  applyWizardInput,
  composeWizardSkill,
  createSkillWizard,
  cycleWizardTemplate,
  parseSkillTriggers,
  renderSkillWorkbench,
  renderSkillWorkflow,
  renderUsageSparkline,
  wizardIsComplete,
} from "../src/extension/skills/workbench.ts";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
};

test("usage sparkline has a fixed width and scales from empty to busy", () => {
  assert.equal(renderUsageSparkline([], 8), "········");
  assert.equal(renderUsageSparkline([0, 1, 2, 4], 4).length, 4);
  const busy = renderUsageSparkline([0, 8], 2);
  assert.notEqual(busy[0], busy[1]);
});

test("skill workflow is a readable pipeline", () => {
  const lines = renderSkillWorkflow({
    name: "review",
    description: "Review diffs",
    category: "project",
    usageCount: 3,
    health: "ok",
    triggers: ["review", "$review"],
  });
  assert.match(lines[0] ?? "", /discover\(project\)/);
  assert.match(lines[0] ?? "", /insert/);
  assert.match(lines[1] ?? "", /\$review/);
});

test("inline wizard walks name → description → template → triggers → confirm", () => {
  let wizard = createSkillWizard();
  wizard = applyWizardInput(wizard, "m");
  wizard = applyWizardInput(wizard, "y");
  wizard = applyWizardInput(wizard, "-");
  wizard = applyWizardInput(wizard, "s");
  wizard = applyWizardInput(wizard, "k");
  wizard = applyWizardInput(wizard, "i");
  wizard = applyWizardInput(wizard, "l");
  wizard = applyWizardInput(wizard, "l");
  wizard = advanceWizard(wizard);
  assert.equal(wizard.step, "description");
  wizard = applyWizardInput(wizard, "H");
  wizard = applyWizardInput(wizard, "i");
  wizard = advanceWizard(wizard);
  assert.equal(wizard.step, "template");
  wizard = cycleWizardTemplate(wizard);
  assert.equal(wizard.template, "browser-workflow");
  wizard = advanceWizard(wizard);
  wizard = applyWizardInput(wizard, "$");
  wizard = applyWizardInput(wizard, "x");
  wizard = advanceWizard(wizard);
  assert.equal(wizard.step, "confirm");
  assert.equal(wizardIsComplete(wizard), true);
  const markdown = composeWizardSkill(wizard);
  assert.match(markdown, /name: my-skill/);
  assert.match(markdown, /description: Hi/);
  assert.match(markdown, /## Triggers/);
  assert.match(markdown, /\$x/);
});

test("wizard rejects an empty name and stays on the name step", () => {
  const wizard = advanceWizard(createSkillWizard());
  assert.equal(wizard.step, "name");
  assert.match(wizard.error ?? "", /required/i);
});

test("workbench split pane lists metadata, sparkline, preview, and empty state", () => {
  const empty = renderSkillWorkbench(theme as never, 80, [], 0, null);
  assert.match(empty.join("\n"), /No skills installed/);
  assert.match(empty.join("\n"), /n or ctrl\+n to open/);

  const lines = renderSkillWorkbench(
    theme as never,
    96,
    [
      {
        name: "wishcraft-tui",
        description: "TUI skill",
        category: "project",
        usageCount: 4,
        usageSeries: [1, 2, 4],
        health: "ok",
        bodyPreview: "Use for Deck and Signal work",
      },
    ],
    0,
    null,
  );
  const body = lines.join("\n");
  assert.match(body, /SKILLS/);
  assert.match(body, /METADATA/);
  assert.match(body, /PREVIEW/);
  assert.match(body, /wishcraft-tui/);
  assert.match(body, /n new skill/);
});

test("wishcraft-tui skill ships SKILL.md and the design reference catalog", () => {
  const root = join(import.meta.dirname, "..", "skills", "wishcraft-tui");
  const refs = [
    "product-language.md",
    "deck-layout.md",
    "signal.md",
    "motion-system.md",
    "motion-gallery.md",
    "theme-contract.md",
    "accessibility.md",
    "responsive.md",
    "regression-testing.md",
  ];
  assert.equal(existsSync(join(root, "SKILL.md")), true);
  for (const ref of refs) {
    const path = join(root, "references", ref);
    assert.equal(existsSync(path), true, ref);
    assert.ok(readFileSync(path, "utf8").length > 40, ref);
  }
});

test("parseSkillTriggers reads a Triggers heading or falls back to name/$name", () => {
  assert.deepEqual(parseSkillTriggers("review", ""), ["review", "$review"]);
  assert.deepEqual(
    parseSkillTriggers(
      "review",
      "# review\n\n## Triggers\n\n- $review\n- /review\n\n## Steps\n\n1. Go\n",
    ),
    ["$review", "/review"],
  );
});

test("workbench list windows around a selection past the first eight skills", () => {
  const skills = Array.from({ length: 12 }, (_, i) => ({
    name: `skill-${String(i + 1).padStart(2, "0")}`,
    description: "d",
    category: "project",
    usageCount: i,
  }));
  const lines = renderSkillWorkbench(theme as never, 80, skills, 10, null);
  const body = lines.join("\n");
  assert.match(body, /SKILLS 11\/12/);
  assert.match(body, /skill-11/);
  assert.doesNotMatch(body, /skill-01/);
});

test("workbench renders the inline wizard when open", () => {
  const wizard = applyWizardInput(createSkillWizard(), "a");
  const lines = renderSkillWorkbench(theme as never, 80, [], 0, wizard);
  assert.match(lines.join("\n"), /NEW SKILL WIZARD/);
  assert.match(lines.join("\n"), /Editing: name/);
});
