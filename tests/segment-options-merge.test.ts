import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parsePowerlineConfig } from "../src/config/parse.ts";
import {
  mergeSegmentOptionSources,
} from "../src/config/segment-options.ts";
import { writeConfigPath } from "../src/extension/settings/config-paths.ts";

const PRESETS = ["default", "chef"] as unknown as readonly string[];

test("mergeSegmentOptionSources fills missing top-level buckets from the nested copy", () => {
  const merged = mergeSegmentOptionSources({
    preset: "chef",
    tps: { mode: "out" },
    segmentOptions: { tps: { windowMs: 2000 }, path: { mode: "full" } },
  });
  assert.deepEqual(merged.tps, { mode: "out", windowMs: 2000 });
  assert.deepEqual(merged.path, { mode: "full" });
  assert.equal(merged.preset, "chef");
});

test("mergeSegmentOptionSources leaves the object untouched without a nested copy", () => {
  const raw = { preset: "chef", tps: { mode: "out" } };
  assert.equal(mergeSegmentOptionSources(raw), raw);
});

test("mergeSegmentOptionSources lets the nested copy win on conflict", () => {
  const merged = mergeSegmentOptionSources({
    tps: { mode: "in", windowMs: 500 },
    segmentOptions: { tps: { mode: "out" } },
  });
  assert.deepEqual(merged.tps, { mode: "out", windowMs: 500 });
});

test("the settings-UI path powerline.segmentOptions.* is honoured", () => {
  // Regression: SETTINGS_REGISTRY writes every `status.*` setting under
  // `powerline.segmentOptions`, but parsePowerlineConfig only ever read the
  // top-level buckets — so a dozen settings were persisted and then ignored.
  const cfg = parsePowerlineConfig(
    {
      preset: "chef",
      segmentOptions: {
        path: { mode: "abbreviated", maxLength: 40 },
        tps: { windowMs: 2000, mode: "in" },
        time: { format: "12h", showSeconds: true },
        git: { hostIcon: true, showAheadBehind: false },
        cost: { currency: "EUR", subscriptionDisplay: "both" },
        context: { format: "percent" },
        openPorts: { includeUdp: true },
      },
    },
    PRESETS,
  );

  assert.equal(cfg.segmentOptions.path?.mode, "abbreviated");
  assert.equal(cfg.segmentOptions.path?.maxLength, 40);
  assert.equal(cfg.segmentOptions.tps?.windowMs, 2000);
  assert.equal(cfg.segmentOptions.tps?.mode, "in");
  assert.equal(cfg.segmentOptions.time?.format, "12h");
  assert.equal(cfg.segmentOptions.time?.showSeconds, true);
  assert.equal(cfg.segmentOptions.git?.hostIcon, true);
  assert.equal(cfg.segmentOptions.git?.showAheadBehind, false);
  assert.equal(cfg.segmentOptions.cost?.currency, "EUR");
  assert.equal(cfg.segmentOptions.cost?.subscriptionDisplay, "both");
  assert.equal(cfg.segmentOptions.context?.format, "percent");
  assert.equal(cfg.segmentOptions.openPorts?.includeUdp, true);
});

test("hand-edited top-level segment options still work", () => {
  const cfg = parsePowerlineConfig(
    { preset: "chef", path: { mode: "full" }, tps: { windowMs: 1500 } },
    PRESETS,
  );
  assert.equal(cfg.segmentOptions.path?.mode, "full");
  assert.equal(cfg.segmentOptions.tps?.windowMs, 1500);
});

test("nested options override the top-level copy", () => {
  const cfg = parsePowerlineConfig(
    {
      preset: "chef",
      tps: { mode: "in", windowMs: 900 },
      segmentOptions: { tps: { mode: "out" } },
    },
    PRESETS,
  );
  assert.equal(cfg.segmentOptions.tps?.mode, "out");
  assert.equal(cfg.segmentOptions.tps?.windowMs, 900);
});

test("a registry path round-trips through writeConfigPath into parsed config", () => {
  // End-to-end: write the way the settings overlay writes, then read the way
  // the runtime reads. These two disagreed before the merge fix.
  const cwd = mkdtempSync(join(tmpdir(), "wishcraft-segopts-"));
  const agentDir = mkdtempSync(join(tmpdir(), "wishcraft-segopts-agent-"));
  const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
  // Writes land in the global file unless the key already exists in the
  // project file, so sandbox pi's agent dir instead of touching ~/.pi/agent.
  process.env.PI_CODING_AGENT_DIR = agentDir;
  try {
    assert.equal(
      writeConfigPath(cwd, "powerline.segmentOptions.path.mode", "basename"),
      true,
    );
    assert.equal(
      writeConfigPath(cwd, "powerline.segmentOptions.tps.windowMs", 2500),
      true,
    );

    const settings = JSON.parse(
      readFileSync(join(agentDir, "settings.json"), "utf-8"),
    );
    const cfg = parsePowerlineConfig(settings.powerline, PRESETS);
    assert.equal(cfg.segmentOptions.path?.mode, "basename");
    assert.equal(cfg.segmentOptions.tps?.windowMs, 2500);
  } finally {
    if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
    rmSync(cwd, { recursive: true, force: true });
    rmSync(agentDir, { recursive: true, force: true });
  }
});
