import test from "node:test";
import assert from "node:assert/strict";
import { PRESETS } from "../src/config/presets.ts";
import { registerCommands } from "../src/extension/commands/commands.ts";
import {
  getPowerlineArgumentCompletions,
  POWERLINE_PLACEMENT_VALUES,
} from "../src/extension/commands/powerline-completions.ts";


test("empty /powerline prefix completes placement and every built-in preset", () => {
  const items = getPowerlineArgumentCompletions("");
  assert.ok(items);
  const values = items.map((item) => item.value);
  assert.deepEqual(
    values.filter((value) => value === "placement"),
    ["placement"],
  );
  for (const name of Object.keys(PRESETS)) {
    assert.ok(values.includes(name), `missing preset ${name}`);
  }
});

test("/powerline pla completes the placement subcommand only", () => {
  const items = getPowerlineArgumentCompletions("pla");
  assert.deepEqual(
    items?.map((item) => item.value),
    ["placement"],
  );
});

test("/powerline placement <tab> completes above, below, and toggle", () => {
  const items = getPowerlineArgumentCompletions("placement ");
  assert.deepEqual(
    items?.map((item) => item.value),
    POWERLINE_PLACEMENT_VALUES.map((value) => `placement ${value}`),
  );
  assert.deepEqual(
    items?.map((item) => item.label),
    [...POWERLINE_PLACEMENT_VALUES],
  );
});

test("/powerline placement a completes above", () => {
  const items = getPowerlineArgumentCompletions("placement a");
  assert.deepEqual(items?.map((item) => item.value), ["placement above"]);
});

test("/powerline d completes the default preset", () => {
  const items = getPowerlineArgumentCompletions("d");
  assert.deepEqual(
    items?.map((item) => item.value),
    ["default"],
  );
});

test("unknown and unsupported /powerline arguments return no completions", () => {
  assert.equal(getPowerlineArgumentCompletions("nope"), null);
  assert.equal(getPowerlineArgumentCompletions("placement sideways"), null);
  assert.equal(getPowerlineArgumentCompletions("placement above extra"), null);
  assert.equal(getPowerlineArgumentCompletions("placement above "), null);
});

test("registered /powerline command exposes completion through its API", () => {
  const commands = new Map<string, { getArgumentCompletions?: (prefix: string) => unknown }>();
  const pi = {
    registerCommand(name: string, command: { getArgumentCompletions?: (prefix: string) => unknown }) {
      commands.set(name, command);
    },
    registerShortcut() {},
  } as never;
  const rt = {
    resolvedShortcuts: { menu: "m", info: "i" },
  } as never;

  registerCommands(pi, rt);
  const powerline = commands.get("powerline");
  assert.ok(powerline?.getArgumentCompletions);
  assert.deepEqual(
    powerline.getArgumentCompletions!("placement "),
    getPowerlineArgumentCompletions("placement "),
  );
  assert.deepEqual(
    powerline.getArgumentCompletions!("d"),
    getPowerlineArgumentCompletions("d"),
  );
});
