import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { BashTranscriptStore } from "../bash-mode/transcript.ts";
import { buildDoctorReport } from "../src/extension/commands/powerline-doctor.ts";

function withAgentDir(
  run: (agentDir: string, projectDir: string) => void,
): void {
  const root = mkdtempSync(join(tmpdir(), "powerline-doctor-"));
  const agentDir = join(root, "agent");
  const projectDir = join(root, "project");
  const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
  const originalTermProgram = process.env.TERM_PROGRAM;

  try {
    mkdirSync(projectDir, { recursive: true });
    process.env.PI_CODING_AGENT_DIR = agentDir;
    delete process.env.TERM_PROGRAM;
    run(agentDir, projectDir);
  } finally {
    if (originalAgentDir === undefined) {
      delete process.env.PI_CODING_AGENT_DIR;
    } else {
      process.env.PI_CODING_AGENT_DIR = originalAgentDir;
    }
    if (originalTermProgram === undefined) {
      delete process.env.TERM_PROGRAM;
    } else {
      process.env.TERM_PROGRAM = originalTermProgram;
    }
    rmSync(root, { recursive: true, force: true });
  }
}

function makeRt() {
  return {
    bashModeActive: false,
    shellSession: null,
    bashTranscript: new BashTranscriptStore({
      transcriptMaxLines: 2000,
      transcriptMaxBytes: 524288,
    }),
  };
}

function checkByName(
  checks: ReturnType<typeof buildDoctorReport>,
  name: string,
) {
  const check = checks.find((candidate) => candidate.name === name);
  assert.ok(check, `expected a "${name}" doctor check`);
  return check;
}

test("doctor reports valid global settings and default config as ok", () =>
  withAgentDir((agentDir) => {
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(
      join(agentDir, "settings.json"),
      JSON.stringify({ powerline: { preset: "default" } }, null, 2),
    );

    const checks = buildDoctorReport(makeRt() as any, { cwd: agentDir });
    assert.equal(checkByName(checks, "settings.global").status, "ok");
    assert.equal(checkByName(checks, "settings.powerline").status, "ok");
    assert.equal(checkByName(checks, "config").status, "ok");
    assert.equal(checkByName(checks, "preset").status, "ok");
  }));

test("doctor flags missing settings files and an unknown preset", () =>
  withAgentDir((agentDir, projectDir) => {
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(
      join(agentDir, "settings.json"),
      JSON.stringify({ powerline: { preset: "nonexistent-preset" } }),
    );

    const checks = buildDoctorReport(makeRt() as any, { cwd: projectDir });
    assert.equal(checkByName(checks, "settings.global").status, "ok");
    assert.equal(checkByName(checks, "settings.project").status, "warn");
    assert.equal(checkByName(checks, "preset").status, "warn");
    assert.match(checkByName(checks, "preset").detail, /nonexistent-preset/);
  }));

test("doctor flags invalid JSON in the global settings file", () =>
  withAgentDir((agentDir) => {
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, "settings.json"), "{ not json");

    const checks = buildDoctorReport(makeRt() as any, { cwd: agentDir });
    assert.equal(checkByName(checks, "settings.global").status, "fail");
  }));

test("doctor detects malformed queue lines and stale locks", () =>
  withAgentDir((agentDir) => {
    mkdirSync(join(agentDir, "powerline-footer"), { recursive: true });
    writeFileSync(
      join(agentDir, "powerline-footer", "inbox.jsonl"),
      '{"id":"a1","text":"fine","createdAt":1,"updatedAt":1,"source":{"cwd":"/tmp"},"target":{"kind":"project","cwd":"/tmp"},"intent":"idea","status":"queued"}\nnot-json\n',
    );
    mkdirSync(join(agentDir, "powerline-footer", "inbox.jsonl.lock"));

    const checks = buildDoctorReport(makeRt() as any, { cwd: agentDir });
    const queue = checkByName(checks, "queue");
    assert.equal(queue.status, "fail");
    assert.match(queue.detail, /stale lock/);
  }));

test("doctor queue check is ok for a healthy empty inbox", () =>
  withAgentDir((agentDir) => {
    mkdirSync(join(agentDir, "powerline-footer"), { recursive: true });
    writeFileSync(join(agentDir, "powerline-footer", "inbox.jsonl"), "");

    const checks = buildDoctorReport(makeRt() as any, { cwd: agentDir });
    const queue = checkByName(checks, "queue");
    assert.equal(queue.status, "ok");
    assert.match(queue.detail, /no items yet/);
  }));

test("doctor nerd-font check honors the POWERLINE_NERD_FONTS override", () => {
  withAgentDir((agentDir) => {
    const original = process.env.POWERLINE_NERD_FONTS;
    process.env.POWERLINE_NERD_FONTS = "1";
    try {
      const checks = buildDoctorReport(makeRt() as any, { cwd: agentDir });
      assert.equal(checkByName(checks, "nerd-fonts").status, "ok");
      assert.match(checkByName(checks, "nerd-fonts").detail, /forced/);
    } finally {
      if (original === undefined) delete process.env.POWERLINE_NERD_FONTS;
      else process.env.POWERLINE_NERD_FONTS = original;
    }
  });
});

test("doctor reports bash mode and git checks", () =>
  withAgentDir((agentDir) => {
    const checks = buildDoctorReport(makeRt() as any, { cwd: agentDir });
    const bash = checkByName(checks, "bash");
    assert.equal(bash.status, "ok");
    assert.match(bash.detail, /inactive/);

    const git = checkByName(checks, "git");
    assert.ok(git.status === "ok" || git.status === "warn");
    assert.match(git.detail, /polling: full/);
  }));
