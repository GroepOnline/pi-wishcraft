import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performDeckAction } from "../src/extension/ui/deck/component.ts";
import { DEFAULT_MOTION_POLICY } from "../src/motion/index.ts";
import type { DeckSessionSnapshot } from "../src/extension/ui/deck/types.ts";
import { composeWizardSkill, createSkillWizard } from "../src/extension/skills/workbench.ts";
import { applyWizardInput, advanceWizard, cycleWizardTemplate } from "../src/extension/skills/workbench.ts";

function snapshot(partial: Partial<DeckSessionSnapshot> = {}): DeckSessionSnapshot {
  return {
    modelLabel: "GPT-5.6",
    branchLabel: "main",
    contextPercent: 10,
    contextTokens: 1,
    contextWindow: 10,
    signalActivity: "ready",
    signalMotion: "ember-relay",
    queueCount: 0,
    ideaCount: 0,
    skillsTotal: 1,
    skillsWarnings: 0,
    policyEnabled: false,
    policyRuleCount: 0,
    shellName: null,
    bashModeActive: false,
    appearanceBase: "lanternwake",
    recentActivity: [],
    nextIntent: null,
    ...partial,
  };
}

test("insert-skill writes the selected body into the editor and closes", () => {
  const dir = mkdtempSync(join(tmpdir(), "deck-insert-"));
  const filePath = join(dir, "SKILL.md");
  writeFileSync(filePath, "---\nname: demo\ndescription: Demo\n---\n\nInsert this body.\n");
  let editor = "existing";
  const notes: string[] = [];
  const ctx = {
    ui: {
      getEditorText: () => editor,
      setEditorText: (text: string) => {
        editor = text;
      },
      notify: (message: string) => notes.push(message),
    },
  };
  const result = performDeckAction(
    { type: "insert-skill", index: 0 },
    { motionPolicy: DEFAULT_MOTION_POLICY } as never,
    ctx,
    snapshot({
      skillSummaries: [
        {
          name: "demo",
          description: "Demo",
          category: "project",
          usageCount: 0,
          filePath,
        },
      ],
    }),
  );
  assert.equal(result, "close");
  assert.match(editor, /Insert this body/);
  assert.match(notes.join("\n"), /inserted/i);
  rmSync(dir, { recursive: true, force: true });
});

test("wizard-complete writes description and triggers from the composed draft", () => {
  const root = mkdtempSync(join(tmpdir(), "deck-wizard-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = root;
  let wizard = createSkillWizard();
  for (const ch of "audit-log") wizard = applyWizardInput(wizard, ch);
  wizard = advanceWizard(wizard);
  for (const ch of "Trace failed jobs") wizard = applyWizardInput(wizard, ch);
  wizard = advanceWizard(wizard);
  wizard = cycleWizardTemplate(wizard);
  wizard = advanceWizard(wizard);
  for (const ch of "$audit") wizard = applyWizardInput(wizard, ch);
  wizard = advanceWizard(wizard);
  const notes: string[] = [];
  try {
    const result = performDeckAction(
      { type: "wizard-complete", wizard },
      { motionPolicy: DEFAULT_MOTION_POLICY } as never,
      { ui: { notify: (message: string) => notes.push(message) } },
      snapshot(),
    );
    assert.equal(result, "continue");
    const written = composeWizardSkill(wizard);
    assert.match(written, /description: Trace failed jobs/);
    assert.match(written, /\$audit/);
    const filePath = join(root, "skills", "audit-log", "SKILL.md");
    assert.equal(existsSync(filePath), true);
    assert.match(readFileSync(filePath, "utf8"), /description: Trace failed jobs/);
    assert.match(readFileSync(filePath, "utf8"), /\$audit/);
    assert.match(notes.join("\n"), /Created skill audit-log/);
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    rmSync(root, { recursive: true, force: true });
  }
});
