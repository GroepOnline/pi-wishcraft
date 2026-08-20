import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPowerlineStatusExport,
  formatPortsStatusValue,
  formatSkillsCountStatusValue,
  HIDDEN_POWERLINE_STATUS_KEYS,
  POWERLINE_STATUS_KEYS,
  publishPowerlineStatuses,
} from "../src/extension/core/status-export.ts";

test("buildPowerlineStatusExport emits only the snapshot keys present", () => {
  assert.deepEqual(
    buildPowerlineStatusExport({ preset: "chef" }),
    [[POWERLINE_STATUS_KEYS.preset, "chef"]],
  );
  assert.deepEqual(
    buildPowerlineStatusExport({ tps: "42", ports: "12" }),
    [
      [POWERLINE_STATUS_KEYS.tps, "42"],
      [POWERLINE_STATUS_KEYS.ports, "12"],
    ],
  );
});

test("buildPowerlineStatusExport keeps an explicit tps clear", () => {
  assert.deepEqual(buildPowerlineStatusExport({ tps: undefined }), [
    [POWERLINE_STATUS_KEYS.tps, undefined],
  ]);
});

test("publishPowerlineStatuses writes each emitted key via setStatus", () => {
  const writes: Array<[string, string | undefined]> = [];
  const ctx = {
    ui: {
      setStatus: (key: string, value: string | undefined) =>
        writes.push([key, value]),
    },
  };
  publishPowerlineStatuses(ctx, { preset: "nerd", tps: undefined });
  assert.deepEqual(writes, [
    [POWERLINE_STATUS_KEYS.preset, "nerd"],
    [POWERLINE_STATUS_KEYS.tps, undefined],
  ]);
});

test("publishPowerlineStatuses is a no-op without a UI status API", () => {
  assert.doesNotThrow(() => publishPowerlineStatuses(null, { preset: "chef" }));
  assert.doesNotThrow(() =>
    publishPowerlineStatuses({ ui: {} }, { preset: "chef" }),
  );
});

test("formatPortsStatusValue shows ? for unknown counts", () => {
  assert.equal(formatPortsStatusValue(12), "12");
  assert.equal(formatPortsStatusValue(0), "0");
  assert.equal(formatPortsStatusValue(-1), "?");
});

test("buildPowerlineStatusExport emits skills.count as a string integer", () => {
  assert.deepEqual(
    buildPowerlineStatusExport({ skillsCount: "7" }),
    [[POWERLINE_STATUS_KEYS.skillsCount, "7"]],
  );
});

test("formatSkillsCountStatusValue stringifies catalog length", () => {
  assert.equal(formatSkillsCountStatusValue(0), "0");
  assert.equal(formatSkillsCountStatusValue(42), "42");
});

test("skills.count stays hidden from the extension_statuses bar", () => {
  assert.equal(
    HIDDEN_POWERLINE_STATUS_KEYS.has(POWERLINE_STATUS_KEYS.skillsCount),
    true,
  );
});
