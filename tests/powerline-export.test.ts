import test from "node:test";
import assert from "node:assert/strict";

import { parsePowerlineConfig } from "../src/config/powerline-config.ts";
import { PRESETS } from "../src/config/presets.ts";
import type { StatusLinePreset } from "../src/config/types.ts";
import {
  buildPowerlineExportSnippet,
  formatPowerlineExport,
} from "../src/extension/commands/powerline-export.ts";

const PRESET_NAMES = Object.keys(PRESETS) as StatusLinePreset[];

test("buildPowerlineExportSnippet exports preset + effective layout", () => {
  const cfg = parsePowerlineConfig(
    { preset: "chef", disabledSegments: ["time"] },
    PRESET_NAMES,
  );
  const snippet = buildPowerlineExportSnippet(cfg);

  assert.equal(snippet.preset, "chef");
  assert.ok(snippet.layout.left.includes("git"));
  assert.ok(snippet.layout.right.includes("tps"));
  assert.ok(snippet.layout.right.includes("open_ports"));
  assert.ok(
    !snippet.layout.right.includes("time"),
    "disabled segments are filtered out of the exported layout",
  );
  assert.equal(snippet.separator, undefined);
  assert.equal(snippet.segmentLabels, undefined);
});

test("buildPowerlineExportSnippet reflects an explicit layout override", () => {
  const cfg = parsePowerlineConfig(
    {
      preset: "chef",
      layout: { left: ["model", "git"], right: ["cost"] },
    },
    PRESET_NAMES,
  );
  const snippet = buildPowerlineExportSnippet(cfg);

  assert.deepEqual(snippet.layout.left, ["model", "git"]);
  assert.deepEqual(snippet.layout.right, ["cost"]);
  assert.equal(snippet.layout.secondary, undefined);
});

test("buildPowerlineExportSnippet includes explicit separator and labels", () => {
  const cfg = parsePowerlineConfig(
    {
      preset: "default",
      separator: "chevron",
      segmentLabels: { tps: "speed", git: "branch" },
    },
    PRESET_NAMES,
  );
  const snippet = buildPowerlineExportSnippet(cfg);

  assert.equal(snippet.separator, "chevron");
  assert.deepEqual(snippet.segmentLabels, { tps: "speed", git: "branch" });
});

test("formatPowerlineExport pretty-prints a round-trippable JSON snippet", () => {
  const snippet = buildPowerlineExportSnippet(
    parsePowerlineConfig({ preset: "minimal" }, PRESET_NAMES),
  );
  const json = formatPowerlineExport(snippet);

  assert.ok(json.startsWith("{"));
  assert.ok(json.includes('"preset": "minimal"'));
  assert.ok(json.includes("\n  "));
  assert.deepEqual(JSON.parse(json), snippet);
});
