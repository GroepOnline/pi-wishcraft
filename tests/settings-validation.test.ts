import test from "node:test";
import assert from "node:assert/strict";

import {
  explainSettingValue,
  getSettingDefinition,
  validateSettingValue,
  validationProblem,
} from "../src/config/settings-registry.ts";
import {
  coerceConfigValue,
  displayValue,
  nextToggleValue,
} from "../src/extension/settings/config-paths.ts";
import { setLocale, tr } from "../src/i18n/index.ts";

function def(id: string) {
  const found = getSettingDefinition(id);
  assert.ok(found, `unknown setting: ${id}`);
  return found;
}

test("explainSettingValue reports a reason instead of just a boolean", () => {
  const motion = def("motion.level");
  assert.deepEqual(explainSettingValue(motion, "reduced"), { ok: true });

  const bad = explainSettingValue(motion, "hyper");
  assert.equal(bad.ok, false);
  assert.equal(bad.ok ? null : bad.kind, "choice");
  assert.equal(bad.ok ? null : bad.choices?.includes("reduced"), true);
  assert.equal(bad.ok ? null : bad.given, "hyper");

  const hooks = def("harness.hooks");
  const badToggle = explainSettingValue(hooks, "on");
  assert.equal(badToggle.ok, false);
  assert.equal(badToggle.ok ? null : badToggle.kind, "boolean");

  const budget = def("budget.dailyTokens");
  assert.deepEqual(explainSettingValue(budget, 500), { ok: true });
  const negative = explainSettingValue(budget, -1);
  assert.equal(negative.ok, false);
  assert.equal(negative.ok ? null : negative.kind, "range");
  assert.equal(negative.ok ? null : negative.min, 0);

  const notANumber = explainSettingValue(budget, "many");
  assert.equal(notANumber.ok, false);
  assert.equal(notANumber.ok ? null : notANumber.kind, "number");
});

test("validateSettingValue stays consistent with the detailed result", () => {
  assert.equal(validateSettingValue(def("motion.level"), "full"), true);
  assert.equal(validateSettingValue(def("motion.level"), "warp"), false);
  assert.equal(validateSettingValue(def("status.preset"), "chef"), true);
  assert.equal(validateSettingValue(def("status.preset"), 12), false);
  assert.equal(validateSettingValue(def("status.path.maxLength"), -5), false);
  assert.equal(validateSettingValue(def("status.path.maxLength"), 0), true);
});

test("validationProblem names the setting, the value and the valid choices", () => {
  const motion = def("motion.level");
  const problem = validationProblem(motion, "hyper", "full");
  assert.ok(problem);
  assert.match(problem!, /Motion level/);
  assert.match(problem!, /hyper/);
  assert.match(problem!, /full/);
  assert.match(problem!, /reduced/);

  const noFallback = validationProblem(motion, "hyper", null);
  assert.ok(noFallback);
  assert.doesNotMatch(noFallback!, /Using default/);

  assert.equal(validationProblem(motion, "reduced", null), null);
});

test("validationProblem says which default is applied", () => {
  const budget = def("budget.dailyTokens");
  const problem = validationProblem(budget, -10, 0);
  assert.ok(problem);
  assert.match(problem!, /-10/);
  assert.match(problem!, /default/i);
});

test("validationProblem is localised", () => {
  setLocale("nl");
  try {
    const problem = validationProblem(def("motion.level"), "hyper", "full");
    assert.ok(problem);
    assert.match(problem!, /verwacht een van/);
    assert.match(problem!, /Bewegingsniveau/);
    assert.match(problem!, /Standaard wordt gebruikt/);
  } finally {
    setLocale("en");
  }
});

test("coerceConfigValue refuses non-numeric input with a reason", () => {
  const tpsWindow = def("status.tps.windowMs");
  const result = coerceConfigValue(tpsWindow, 1000, "fast");
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.reason.includes("TPS window (ms)"));
  assert.ok(!result.ok && result.reason.includes("fast"));

  const empty = coerceConfigValue(tpsWindow, 1000, "   ");
  assert.equal(empty.ok, true);
  assert.equal(empty.ok ? empty.value : null, null);
});

test("coerceConfigValue enforces the declared numeric range", () => {
  const budget = def("budget.dailyTokens");
  const tooSmall = coerceConfigValue(budget, 0, "-1");
  assert.equal(tooSmall.ok, false);

  const ok = coerceConfigValue(budget, 0, "250000");
  assert.equal(ok.ok, true);
  assert.equal(ok.ok ? ok.value : null, 250000);
});

test("coerceConfigValue refuses an unknown choice", () => {
  const separator = def("status.separator");
  const bad = coerceConfigValue(separator, null, "squiggles");
  assert.equal(bad.ok, false);
  const reason = bad.ok ? "" : bad.reason;
  assert.ok(reason.includes("Separator"), reason);
  assert.ok(reason.includes("squiggles"), reason);
  // The valid choices must be discoverable from the message alone.
  assert.ok(reason.includes("chevron"), reason);

  const good = coerceConfigValue(separator, null, "chevron");
  assert.equal(good.ok, true);
  assert.equal(good.ok ? good.value : null, "chevron");
});

test("coerceConfigValue passes text through trimmed", () => {
  const currency = def("status.cost.currency");
  const result = coerceConfigValue(currency, null, "  EUR  ");
  assert.equal(result.ok, true);
  assert.equal(result.ok ? result.value : null, "EUR");
});

test("displayValue and nextToggleValue localise on/off", () => {
  const hooks = def("harness.hooks");
  assert.equal(displayValue(hooks, true), "on");
  assert.equal(displayValue(hooks, false), "off");
  assert.equal(displayValue(hooks, null), "on"); // declared default
  assert.equal(nextToggleValue(hooks, null), false);
  assert.equal(nextToggleValue(hooks, false), true);
  assert.equal(nextToggleValue(hooks, true), false);

  setLocale("nl");
  try {
    assert.equal(displayValue(hooks, true), "aan");
    assert.equal(displayValue(hooks, false), "uit");
    assert.equal(tr("config.saved", "saved"), "opgeslagen");
  } finally {
    setLocale("en");
  }
});

test("text settings report a type problem for non-string values", () => {
  const menu = def("shortcut.menu");
  const result = explainSettingValue(menu, true);
  assert.equal(result.ok, false);
  assert.equal(result.ok ? null : result.kind, "text");

  const problem = validationProblem(menu, true, null);
  assert.ok(problem);
  assert.match(problem!, /Menu/);
});
