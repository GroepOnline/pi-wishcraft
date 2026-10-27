import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  WIZARD_STEP_IDS,
  applyWizard,
  createWizardState,
  displayWizardValue,
  wizardCycle,
  wizardIsReview,
  wizardNext,
  wizardPrevious,
  wizardProgressText,
  wizardStepCount,
  wizardSteps,
  wizardSummary,
} from "../src/extension/settings/setup-wizard.ts";
import { setLocale } from "../src/i18n/index.ts";

function freshCwd(): string {
  const cwd = mkdtempSync(join(tmpdir(), "wishcraft-wizard-"));
  mkdirSync(join(cwd, ".pi"), { recursive: true });
  return cwd;
}

const originalAgentDir = process.env.PI_CODING_AGENT_DIR;

/**
 * Redirect pi's agent dir at a temp folder. `writeSettingKey` persists to the
 * *global* settings file when the key is not yet present in the project file,
 * so without this the test would write into the real `~/.pi/agent`.
 */
function sandboxAgentDir(): { dir: string; restore: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "wishcraft-wizard-agent-"));
  process.env.PI_CODING_AGENT_DIR = dir;
  return {
    dir,
    restore: () => {
      if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test("the wizard asks exactly the four highest-leverage questions", () => {
  const steps = wizardSteps();
  assert.equal(steps.length, 4);
  assert.deepEqual(
    steps.map((step) => step.id),
    [...WIZARD_STEP_IDS],
  );
  assert.equal(wizardStepCount(), 4);

  const byId = new Map(steps.map((step) => [step.id, step]));
  assert.equal(byId.get("interface.language")?.kind, "select");
  assert.deepEqual(byId.get("interface.language")?.choices, ["en", "nl"]);
  assert.equal(byId.get("status.preset")?.kind, "select");
  assert.equal(byId.get("motion.level")?.kind, "select");
  assert.equal(byId.get("welcome.enabled")?.kind, "toggle");
  assert.deepEqual(byId.get("welcome.enabled")?.choices, ["on", "off"]);

  for (const step of steps) assert.ok(step.label.length > 0, step.id);
});

test("the state is seeded from the operator's current settings", () => {
  const state = createWizardState({
    wishcraft: { locale: "nl" },
    powerline: { preset: "nerd", welcome: false },
  });
  assert.equal(state.step, 0);
  assert.equal(state.values["interface.language"], "nl");
  assert.equal(state.values["status.preset"], "nerd");
  assert.equal(state.values["welcome.enabled"], false);
  // Unset → declared default.
  assert.equal(state.values["motion.level"], "full");

  // Invalid stored values fall back instead of poisoning the wizard.
  const dirty = createWizardState({ powerline: { motionLevel: "warp" } });
  assert.equal(dirty.values["motion.level"], "full");
});

test("cycling walks the choice list in both directions", () => {
  let state = createWizardState({});
  assert.equal(state.values["interface.language"], "en");

  state = wizardCycle(state, 1);
  assert.equal(state.values["interface.language"], "nl");
  state = wizardCycle(state, 1);
  assert.equal(state.values["interface.language"], "en");
  state = wizardCycle(state, -1);
  assert.equal(state.values["interface.language"], "nl");

  // Toggles flip rather than cycle.
  state = wizardNext(state); // → status.preset
  state = wizardNext(state); // → motion.level
  state = wizardNext(state); // → welcome.enabled
  assert.equal(wizardIsReview(state), false);
  // `powerline.welcome` defaults to on.
  assert.equal(state.values["welcome.enabled"], true);
  state = wizardCycle(state, 1);
  assert.equal(state.values["welcome.enabled"], false);
  state = wizardCycle(state, -1);
  assert.equal(state.values["welcome.enabled"], true);
});

test("navigation advances to a review screen and clamps at both ends", () => {
  let state = createWizardState({});
  assert.equal(wizardPrevious(state).step, 0, "clamps at the first step");

  for (let i = 0; i < wizardStepCount(); i++) state = wizardNext(state);
  assert.equal(wizardIsReview(state), true);
  assert.equal(wizardProgressText(state), "Ready to write");

  state = wizardNext(state);
  assert.equal(wizardIsReview(state), true, "clamps on the review screen");

  state = wizardPrevious(state);
  assert.equal(state.step, wizardStepCount() - 1);
  assert.equal(wizardProgressText(state), "Step 4 of 4");
});

test("cycling on the review screen is a no-op", () => {
  let state = createWizardState({});
  for (let i = 0; i <= wizardStepCount(); i++) state = wizardNext(state);
  const cycled = wizardCycle(state, 1);
  assert.deepEqual(cycled, state);
});

test("the review rows show localised labels and values", () => {
  let state = createWizardState({
    powerline: { preset: "chef", welcome: false },
  });
  for (let i = 0; i < wizardStepCount(); i++) state = wizardNext(state);

  const rows = wizardSummary(state);
  assert.equal(rows.length, 4);
  assert.deepEqual(
    rows.map((row) => row.path),
    [
      "wishcraft.locale",
      "powerline.preset",
      "powerline.motionLevel",
      "powerline.welcome",
    ],
  );
  const preset = rows.find((row) => row.path === "powerline.preset");
  assert.equal(preset?.value, "chef");
  const welcome = rows.find((row) => row.path === "powerline.welcome");
  assert.equal(welcome?.value, "off");
  const language = rows.find((row) => row.path === "wishcraft.locale");
  assert.equal(language?.value, "en");

  setLocale("nl");
  try {
    const dutch = wizardSummary(state);
    assert.equal(dutch[0]?.label, "Taal");
    assert.equal(dutch[3]?.label, "Welkom-overlay");
    assert.equal(
      displayWizardValue(wizardSteps()[3]!, false),
      "uit",
    );
    assert.match(wizardProgressText(state), /Stap 5|Klaar om te schrijven/);
  } finally {
    setLocale("en");
  }
});

test("applyWizard persists every choice into settings.json", () => {
  const cwd = freshCwd();
  const agent = sandboxAgentDir();
  try {
    let state = createWizardState({});
    state = wizardCycle(state, 1); // language → nl
    for (let i = 0; i < wizardStepCount(); i++) state = wizardNext(state);

    let reloaded: Record<string, unknown> | null = null;
    const ok = applyWizard(cwd, state, (settings) => {
      reloaded = settings;
    });

    assert.equal(ok, true);
    const written = JSON.parse(
      readFileSync(join(agent.dir, "settings.json"), "utf-8"),
    );
    assert.equal(written.wishcraft.locale, "nl");
    assert.equal(written.powerline.preset, "default");
    assert.equal(written.powerline.motionLevel, "full");
    assert.equal(written.powerline.welcome, true);
    assert.ok(reloaded, "the powerline reload callback must fire");
  } finally {
    setLocale("en");
    agent.restore();
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("applyWizard writes only what the wizard owns", () => {
  const cwd = freshCwd();
  const agent = sandboxAgentDir();
  try {
    const state = createWizardState({});
    assert.equal(applyWizard(cwd, state), true);
    const written = JSON.parse(
      readFileSync(join(agent.dir, "settings.json"), "utf-8"),
    );
    assert.deepEqual(Object.keys(written.powerline).sort(), [
      "motionLevel",
      "preset",
      "welcome",
    ]);
    assert.deepEqual(Object.keys(written.wishcraft), ["locale"]);
  } finally {
    agent.restore();
    rmSync(cwd, { recursive: true, force: true });
  }
});
