import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PRESETS } from "../src/config/presets.ts";
import {
  getPowerlineArgumentCompletions,
  POWERLINE_PLACEMENT_VALUES,
} from "../src/extension/commands/powerline-completions.ts";

const commandsSource = readFileSync(
  new URL("../src/extension/commands/commands.ts", import.meta.url),
  "utf8",
);

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

test("unknown /powerline prefixes return no completions", () => {
  assert.equal(getPowerlineArgumentCompletions("nope"), null);
  assert.equal(getPowerlineArgumentCompletions("placement sideways"), null);
});

test("registerCommand(powerline) wires getPowerlineArgumentCompletions", () => {
  assert.match(commandsSource, /getPowerlineArgumentCompletions/);
  assert.match(
    commandsSource,
    /getArgumentCompletions\(argumentPrefix\) \{\s*return getPowerlineArgumentCompletions\(argumentPrefix\);/s,
  );
});
