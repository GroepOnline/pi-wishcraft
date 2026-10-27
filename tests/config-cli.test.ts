import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  applyConfigSet,
  applyConfigUnset,
  formatSettingInfo,
  getWishcraftArgumentCompletions,
  inspectSetting,
  parseConfigCliArgs,
  parseToggleWord,
  suggestSettingPath,
} from "../src/extension/settings/config-cli.ts";
import { SETTINGS_REGISTRY } from "../src/config/settings-registry.ts";

// ---------------------------------------------------------------------------
// Hermetic settings dir: PI_CODING_AGENT_DIR points the global settings.json
// into a temp dir so no test ever touches the developer's real ~/.pi.
// ---------------------------------------------------------------------------
const originalAgentDir = process.env.PI_CODING_AGENT_DIR;

function withTempCwd(
  body: (cwd: string, agentDir: string) => void,
): void {
  const agentDir = mkdtempSync(join(tmpdir(), "wishcraft-cli-agent-"));
  const cwd = mkdtempSync(join(tmpdir(), "wishcraft-cli-project-"));
  process.env.PI_CODING_AGENT_DIR = agentDir;
  mkdirSync(join(cwd, ".pi"), { recursive: true });
  // Seed every managed root in the project file so `writeSettingKey` picks
  // the project scope — writes land where the assertions read them.
  writeFileSync(
    join(cwd, ".pi", "settings.json"),
    JSON.stringify(
      { powerline: {}, wishcraft: {}, bashMode: {}, powerlineShortcuts: {} },
      null,
      2,
    ),
  );
  try {
    body(cwd, agentDir);
  } finally {
    if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
    rmSync(agentDir, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  }
}

function readGlobal(agentDir: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(join(agentDir, "settings.json"), "utf8"));
  } catch {
    return {};
  }
}

function readProject(cwd: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(join(cwd, ".pi", "settings.json"), "utf8"));
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Grammar
// ---------------------------------------------------------------------------

test("parseConfigCliArgs recognises verbs and aliases", () => {
  assert.deepEqual(parseConfigCliArgs("get powerline.preset"), {
    verb: "get",
    path: "powerline.preset",
  });
  assert.deepEqual(parseConfigCliArgs("set motion.level off"), {
    verb: "set",
    path: "motion.level",
    value: "off",
  });
  assert.deepEqual(parseConfigCliArgs("unset powerline.welcome"), {
    verb: "unset",
    path: "powerline.welcome",
  });
  assert.deepEqual(parseConfigCliArgs("reset powerline.welcome"), {
    verb: "unset",
    path: "powerline.welcome",
  });
  assert.deepEqual(parseConfigCliArgs("show powerline.preset"), {
    verb: "get",
    path: "powerline.preset",
  });
  assert.deepEqual(parseConfigCliArgs("help"), { verb: "help" });
  assert.deepEqual(parseConfigCliArgs("?"), { verb: "help" });
});

test("parseConfigCliArgs keeps spaces inside text values", () => {
  assert.deepEqual(
    parseConfigCliArgs("set powerline.segmentLabels.tps speed tps"),
    { verb: "set", path: "powerline.segmentLabels.tps", value: "speed tps" },
  );
});

test("parseConfigCliArgs returns null for non-CLI input (Deck routes)", () => {
  assert.equal(parseConfigCliArgs(""), null);
  assert.equal(parseConfigCliArgs("ports"), null);
  assert.equal(parseConfigCliArgs("settings"), null);
  assert.equal(parseConfigCliArgs("setup"), null);
  assert.equal(parseConfigCliArgs("doctor"), null);
  assert.equal(parseConfigCliArgs("home"), null);
});

test("parseConfigCliArgs keeps verbs with a missing path so usage can fire", () => {
  assert.deepEqual(parseConfigCliArgs("set"), { verb: "set", path: "" });
  assert.deepEqual(parseConfigCliArgs("get"), { verb: "get", path: "" });
  assert.deepEqual(parseConfigCliArgs("set powerline.preset"), {
    verb: "set",
    path: "powerline.preset",
    value: "",
  });
});

test("parseToggleWord accepts operator vocabulary only", () => {
  assert.equal(parseToggleWord("on"), true);
  assert.equal(parseToggleWord("ON"), true);
  assert.equal(parseToggleWord("true"), true);
  assert.equal(parseToggleWord("1"), true);
  assert.equal(parseToggleWord("yes"), true);
  assert.equal(parseToggleWord("off"), false);
  assert.equal(parseToggleWord("false"), false);
  assert.equal(parseToggleWord("0"), false);
  assert.equal(parseToggleWord("no"), false);
  assert.equal(parseToggleWord("maybe"), null);
  assert.equal(parseToggleWord(""), null);
});

// ---------------------------------------------------------------------------
// set / unset round trips
// ---------------------------------------------------------------------------

test("set writes a select value, get reads it back from project scope", () => {
  withTempCwd((cwd) => {
    const result = applyConfigSet(cwd, "motion.level", "off");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value, "off");
    assert.equal(result.path, "powerline.motionLevel");

    const project = readProject(cwd);
    assert.equal(
      (project.powerline as Record<string, unknown>).motionLevel,
      "off",
    );

    const info = inspectSetting({}, project, "powerline.motionLevel");
    assert.equal(info.known, true);
    assert.equal(info.source, "project");
    assert.equal(info.effective, "off");
    const line = formatSettingInfo(info);
    assert.match(line, /powerline\.motionLevel/);
    assert.match(line, /off/);
    assert.match(line, /project/);
  });
});

test("set resolves unique choice prefixes (red → reduced)", () => {
  withTempCwd((cwd) => {
    const result = applyConfigSet(cwd, "motion.level", "red");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value, "reduced");
  });
});

test("set rejects an ambiguous prefix with the choices listed", () => {
  withTempCwd((cwd) => {
    // "f" matches full and functional → refuse rather than guess.
    const result = applyConfigSet(cwd, "motion.level", "f");
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.message, /full/);
    assert.match(result.message, /functional/);
  });
});

test("set flips a toggle with on/off words, not strings", () => {
  withTempCwd((cwd) => {
    const on = applyConfigSet(cwd, "powerline.welcome", "off");
    assert.equal(on.ok, true);
    if (on.ok) {
      assert.equal(on.value, false);
      assert.equal(on.display, "off");
    }
    const project = readProject(cwd);
    assert.equal(
      (project.powerline as Record<string, unknown>).welcome,
      false,
    );

    const bad = applyConfigSet(cwd, "powerline.welcome", "maybe");
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.match(bad.message, /on or off/);
  });
});

test("set validates numbers against registry bounds", () => {
  withTempCwd((cwd) => {
    const ok = applyConfigSet(cwd, "wishcraft.tokenBudget.daily", "250000");
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.value, 250000);

    const below = applyConfigSet(cwd, "wishcraft.tokenBudget.daily", "-5");
    assert.equal(below.ok, false);
    if (!below.ok) assert.match(below.message, /number/);

    const nan = applyConfigSet(cwd, "wishcraft.tokenBudget.daily", "abc");
    assert.equal(nan.ok, false);
    if (!nan.ok) assert.match(nan.message, /not a number/);
  });
});

test("set enforces the new min/max bounds (transcript lines ≥ 100)", () => {
  withTempCwd((cwd) => {
    const ok = applyConfigSet(cwd, "bashMode.transcriptMaxLines", "500");
    assert.equal(ok.ok, true);
    const tooSmall = applyConfigSet(cwd, "bashMode.transcriptMaxLines", "10");
    assert.equal(tooSmall.ok, false);
    if (!tooSmall.ok) assert.match(tooSmall.message, /100/);

    const retention = applyConfigSet(cwd, "powerline.queue.retentionHours", "99999");
    assert.equal(retention.ok, false);
    if (!retention.ok) assert.match(retention.message, /8760/);
  });
});

test("set on an unknown path suggests the nearest registered path", () => {
  withTempCwd((cwd) => {
    const result = applyConfigSet(cwd, "powerline.presot", "chef");
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.message, /Unknown setting/);
    assert.match(result.message, /powerline\.preset/);
  });
});

test("set refuses structured paths with a pointer to settings.json", () => {
  withTempCwd((cwd) => {
    const result = applyConfigSet(cwd, "powerline.layout", "{}");
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.message, /settings\.json/);
  });
});

test("set with empty text clears the key so the default applies", () => {
  withTempCwd((cwd) => {
    const first = applyConfigSet(cwd, "powerline.segmentLabels.tps", "tps");
    assert.equal(first.ok, true);
    const cleared = applyConfigSet(cwd, "powerline.segmentLabels.tps", "   ");
    assert.equal(cleared.ok, true);
    if (cleared.ok) assert.equal(cleared.value, null);

    const project = readProject(cwd);
    const labels = (project.powerline as Record<string, unknown>)
      .segmentLabels as Record<string, unknown>;
    assert.ok(!("tps" in labels));
  });
});

test("unset removes the stored key and reports the default", () => {
  withTempCwd((cwd) => {
    applyConfigSet(cwd, "motion.level", "off");
    const result = applyConfigUnset(cwd, "motion.level");
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.path, "powerline.motionLevel");
    // Default for motion.level is "full".
    assert.equal(result.effective, "full");

    const info = inspectSetting({}, readProject(cwd), "motion.level");
    assert.equal(info.source, "default");
    assert.match(formatSettingInfo(info), /not stored/);
  });
});

test("unset on an unknown path fails without writing", () => {
  withTempCwd((cwd) => {
    const result = applyConfigUnset(cwd, "powerline.nope");
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, /Unknown setting/);
  });
});

// ---------------------------------------------------------------------------
// Inspection & completion
// ---------------------------------------------------------------------------

test("inspectSetting reports precedence: project over global over default", () => {
  const global = { powerline: { preset: "minimal", motionLevel: "reduced" } };
  const project = { powerline: { preset: "chef" } };

  const overridden = inspectSetting(global, project, "powerline.preset");
  assert.equal(overridden.source, "project");
  assert.equal(overridden.effective, "chef");

  const globalOnly = inspectSetting(global, project, "motion.level");
  assert.equal(globalOnly.source, "global");
  assert.equal(globalOnly.effective, "reduced");

  const unset = inspectSetting(global, project, "powerline.welcome");
  assert.equal(unset.source, "default");
  assert.equal(unset.effective, true);

  // Id form resolves to the same path.
  const byId = inspectSetting(global, project, "status.preset");
  assert.equal(byId.path, "powerline.preset");
});

test("inspectSetting flags invalid stored values with a problem", () => {
  const global = { powerline: { motionLevel: "warp-speed" } };
  const info = inspectSetting(global, {}, "motion.level");
  assert.equal(info.source, "global");
  assert.notEqual(info.effective, "warp-speed");
  assert.ok(info.problem !== null);
  assert.match(formatSettingInfo(info), /⚠/);
});

test("inspectSetting marks unregistered paths as unknown, keeping raw JSON", () => {
  const global = { powerline: { layout: { left: ["git"] } } };
  const info = inspectSetting(global, {}, "powerline.layout");
  assert.equal(info.known, false);
  assert.deepEqual(info.stored, { left: ["git"] });
  assert.match(formatSettingInfo(info), /settings\.json/);
});

test("suggestSettingPath finds near misses and rejects nonsense", () => {
  assert.equal(suggestSettingPath("powerline.presot"), "powerline.preset");
  assert.equal(suggestSettingPath("motion.leval"), "powerline.motionLevel");
  assert.equal(
    suggestSettingPath("wishcraft.tokenBudget.dialy"),
    "wishcraft.tokenBudget.daily",
  );
  assert.equal(suggestSettingPath("completely.unrelated.thing"), null);
});

test("completion offers subcommands on an empty prefix", () => {
  const items = getWishcraftArgumentCompletions("");
  assert.ok(items);
  const values = items.map((item) => item.value);
  for (const expected of ["get", "set", "unset", "settings", "setup", "doctor", "help"]) {
    assert.ok(values.includes(expected), `missing ${expected}`);
  }
  assert.deepEqual(getWishcraftArgumentCompletions("zzz"), null);
});

test("completion filters subcommands by prefix", () => {
  const items = getWishcraftArgumentCompletions("se");
  assert.ok(items);
  const values = items.map((item) => item.value);
  assert.ok(values.includes("set"));
  assert.ok(values.includes("settings"));
  assert.ok(values.includes("setup"));
  assert.ok(!values.includes("doctor"));
});

test("completion lists registered paths after a verb", () => {
  const items = getWishcraftArgumentCompletions("set ");
  assert.ok(items);
  const values = items.map((item) => item.value);
  assert.ok(values.length > 20, `expected many paths, got ${values.length}`);
  assert.ok(values.every((value) => value.startsWith("set ")));
  assert.ok(values.includes("set powerline.preset"));
  assert.ok(values.includes("set bashMode.transcriptMaxLines"));

  const filtered = getWishcraftArgumentCompletions("set powerline.motion");
  assert.ok(filtered);
  assert.deepEqual(
    filtered.map((item) => item.value),
    ["set powerline.motionLevel"],
  );
});

test("completion offers choices and on/off in the value position", () => {
  const choices = getWishcraftArgumentCompletions("set motion.level ");
  assert.ok(choices);
  const values = choices.map((item) => item.value);
  // Values replace the whole argument in canonical path form — the same
  // contract as `/signal placement above`.
  assert.ok(values.includes("set powerline.motionLevel full"));
  assert.ok(values.includes("set powerline.motionLevel reduced"));
  assert.ok(values.includes("set powerline.motionLevel off"));

  const partial = getWishcraftArgumentCompletions("set motion.level red");
  assert.ok(partial);
  assert.deepEqual(partial.map((item) => item.value), [
    "set powerline.motionLevel reduced",
  ]);

  const toggle = getWishcraftArgumentCompletions("set powerline.welcome ");
  assert.ok(toggle);
  assert.deepEqual(toggle.map((item) => item.value), [
    "set powerline.welcome on",
    "set powerline.welcome off",
  ]);

  // get/unset never take a value.
  assert.equal(getWishcraftArgumentCompletions("get powerline.preset "), null);
  assert.equal(getWishcraftArgumentCompletions("unset powerline.preset "), null);
  // Text/number settings have no enumerable values.
  assert.equal(
    getWishcraftArgumentCompletions("set powerline.segmentLabels.tps "),
    null,
  );
});

test("registry paths offered by completion stay unique", () => {
  const paths = SETTINGS_REGISTRY.map((definition) => definition.path);
  assert.equal(new Set(paths).size, paths.length);
});
