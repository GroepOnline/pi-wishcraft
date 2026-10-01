import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildConfigDiagnostics,
  getCachedConfigDiagnostics,
  invalidateConfigDiagnosticsCache,
} from "../src/extension/settings/config-diagnostics.ts";
import { configDoctorItems } from "../src/extension/settings/config-doctor.ts";
import {
  configDiagnosticLines,
} from "../src/extension/ui/deck/config-diagnostic-lines.ts";

interface Sandbox {
  agentDir: string;
  projectDir: string;
  globalPath: string;
  projectPath: string;
  cleanup: () => void;
}

const originalAgentDir = process.env.PI_CODING_AGENT_DIR;

function sandbox(): Sandbox {
  const root = mkdtempSync(join(tmpdir(), "wishcraft-diag-"));
  const agentDir = join(root, "agent");
  const projectDir = join(root, "project");
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(join(projectDir, ".pi"), { recursive: true });
  process.env.PI_CODING_AGENT_DIR = agentDir;
  invalidateConfigDiagnosticsCache();
  return {
    agentDir,
    projectDir,
    globalPath: join(agentDir, "settings.json"),
    projectPath: join(projectDir, ".pi", "settings.json"),
    cleanup: () => {
      if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
      invalidateConfigDiagnosticsCache();
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

test("missing settings files are reported as defaults, not as failures", () => {
  const box = sandbox();
  try {
    const report = buildConfigDiagnostics(box.projectDir);
    assert.equal(report.files.length, 2);
    for (const file of report.files) {
      assert.equal(file.exists, false);
      assert.equal(file.validJson, true);
    }
    assert.equal(report.conflicts.length, 0);
    assert.equal(report.unknownKeys.length, 0);
    assert.equal(report.counts.stored, 0);
    assert.equal(report.counts.defaulted, report.counts.total);
    assert.equal(report.checks.some((c) => c.severity === "fail"), false);
  } finally {
    box.cleanup();
  }
});

test("an unparseable settings file is a hard failure", () => {
  const box = sandbox();
  try {
    writeFileSync(box.globalPath, "{ not json");
    const report = buildConfigDiagnostics(box.projectDir);
    const global = report.files.find((f) => f.scope === "global");
    assert.ok(global);
    assert.equal(global!.exists, true);
    assert.equal(global!.validJson, false);
    assert.ok(global!.error);
    assert.equal(
      report.checks.some((c) => c.severity === "fail" && c.name === "settings.global"),
      true,
    );
  } finally {
    box.cleanup();
  }
});

test("the project file wins over the global file and the override is flagged", () => {
  const box = sandbox();
  try {
    writeJson(box.globalPath, {
      powerline: { preset: "default", separator: "pipe" },
      wishcraft: { hooksEnabled: true },
    });
    writeJson(box.projectPath, {
      powerline: { preset: "chef" },
    });

    const report = buildConfigDiagnostics(box.projectDir);
    const preset = report.settings.find((s) => s.id === "status.preset");
    assert.ok(preset);
    assert.equal(preset!.source, "project");
    assert.equal(preset!.effective, "chef");

    const separator = report.settings.find((s) => s.id === "status.separator");
    assert.ok(separator);
    assert.equal(separator!.source, "global");
    assert.equal(separator!.effective, "pipe");

    const hooks = report.settings.find((s) => s.id === "harness.hooks");
    assert.ok(hooks);
    assert.equal(hooks!.source, "global");
    assert.equal(hooks!.effective, true);

    assert.deepEqual(
      report.conflicts.map((c) => c.path),
      ["powerline.preset"],
    );
    assert.equal(report.conflicts[0]?.globalValue, '"default"');
    assert.equal(report.conflicts[0]?.projectValue, '"chef"');
    assert.equal(report.counts.conflicts, 1);
    assert.equal(
      report.checks.some((c) => c.name === "conflict:powerline.preset"),
      true,
    );
  } finally {
    box.cleanup();
  }
});

test("an invalid stored value is reported with an explanation", () => {
  const box = sandbox();
  try {
    writeJson(box.globalPath, { powerline: { motionLevel: "warp" } });
    const report = buildConfigDiagnostics(box.projectDir);

    const motion = report.settings.find((s) => s.id === "motion.level");
    assert.ok(motion);
    assert.equal(motion!.source, "global");
    assert.equal(motion!.stored, "warp");
    // Falls back to the declared default while still flagging the value.
    assert.equal(motion!.effective, "full");
    assert.ok(motion!.problem);
    assert.match(motion!.problem!, /Motion level/);
    assert.equal(report.counts.invalid, 1);
    assert.equal(report.counts.stored, 1);
    assert.equal(
      report.checks.some((c) => c.name === "invalid:motion.level"),
      true,
    );
  } finally {
    box.cleanup();
  }
});

test("a near-miss key is reported with a did-you-mean suggestion", () => {
  const box = sandbox();
  try {
    writeJson(box.globalPath, { powerline: { seperator: "pipe" } });
    const report = buildConfigDiagnostics(box.projectDir);

    assert.equal(report.unknownKeys.length, 1);
    const unknown = report.unknownKeys[0];
    assert.equal(unknown?.path, "powerline.seperator");
    assert.equal(unknown?.suggestion, "powerline.separator");
    assert.equal(
      report.checks.some((c) => c.name === "unknown:powerline.seperator"),
      true,
    );
  } finally {
    box.cleanup();
  }
});

test("keys outside the managed roots are never flagged", () => {
  const box = sandbox();
  try {
    // pi's settings.json carries plenty of keys Wishcraft does not own.
    writeJson(box.globalPath, {
      packages: ["npm:some-extension"],
      theme: "dark",
      powerline: { preset: "default" },
    });
    const report = buildConfigDiagnostics(box.projectDir);
    assert.deepEqual(report.unknownKeys, []);
  } finally {
    box.cleanup();
  }
});

test("the render-path cache re-reads only when a file changes", () => {
  const box = sandbox();
  try {
    const first = getCachedConfigDiagnostics(box.projectDir);
    const second = getCachedConfigDiagnostics(box.projectDir);
    assert.equal(first, second, "unchanged files must not re-parse");

    writeJson(box.globalPath, { powerline: { preset: "nerd" } });
    const third = getCachedConfigDiagnostics(box.projectDir);
    assert.notEqual(third, first, "a changed file must invalidate the cache");

    invalidateConfigDiagnosticsCache();
    const fourth = getCachedConfigDiagnostics(box.projectDir);
    assert.notEqual(fourth, third, "invalidation forces a fresh read");
    assert.equal(
      fourth.settings.find((s) => s.id === "status.preset")?.source,
      "global",
    );
  } finally {
    box.cleanup();
  }
});

test("the Deck body renders sections and stays inside its line budget", () => {
  const box = sandbox();
  try {
    writeJson(box.globalPath, {
      powerline: { motionLevel: "warp", seperator: "pipe" },
    });
    const lines = configDiagnosticLines(box.projectDir, 40);

    assert.ok(lines.length <= 17, `too many lines: ${lines.length}`);
    const joined = lines.join("\n");
    assert.match(joined, /Config diagnosis/);
    assert.match(joined, /Sources/);
    assert.match(joined, /Conflicts/);
    assert.match(joined, /Unknown keys/);
    assert.match(joined, /Settings/);
    assert.match(joined, /seperator/);
    assert.match(joined, /motionLevel/);

    // Every line must fit the requested width.
    for (const line of lines) {
      // eslint-disable-next-line no-control-regex
      assert.ok(line.replace(/\x1b\[[0-9;]*m/g, "").length <= 40, line);
    }
  } finally {
    box.cleanup();
  }
});

test("doctor items are copyable one-liners with a severity marker", () => {
  const box = sandbox();
  try {
    writeJson(box.globalPath, { powerline: { motionLevel: "warp" } });
    const report = buildConfigDiagnostics(box.projectDir);
    const items = configDoctorItems(report);

    assert.equal(items.length, report.checks.length);
    for (const item of items) {
      assert.ok(item.label.startsWith("[ok]  ") || item.label.startsWith("[warn]") || item.label.startsWith("[fail]"), item.label);
      assert.ok(item.value.includes(":"));
    }
    assert.ok(items.some((i) => i.label.startsWith("[warn]")));
  } finally {
    box.cleanup();
  }
});
