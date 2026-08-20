import test from "node:test";
import assert from "node:assert/strict";
import { renderSegment } from "../src/segments/index.ts";
import {
  parseOpenPortProcesses,
  sanitizeSshHost,
} from "../src/segments/system.ts";
import { resolvePreset, PRESETS } from "../src/config/presets.ts";
import type {
  ColorScheme,
  SegmentContext,
  ThemeLike,
} from "../src/config/types.ts";

function createSegmentContext(
  overrides: Partial<SegmentContext> = {},
): SegmentContext {
  const colors: ColorScheme = {
    gitClean: "#111111",
    gitDirty: "#111111",
    separator: "#222222",
    context: "#333333",
    cost: "#333333",
    queue: "#444444",
    tokens: "#555555",
  };
  return {
    model: undefined,
    thinkingLevel: "off",
    sessionId: undefined,
    usageStats: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
      subagentCost: 0,
    },
    contextTokens: 0,
    contextPercent: 0,
    contextWindow: 0,
    autoCompactEnabled: true,
    customCompactionEnabled: false,
    usingSubscription: false,
    sessionStartTime: Date.now(),
    shellModeActive: false,
    shellRunning: false,
    shellName: null,
    shellCwd: null,
    git: { branch: null, staged: 0, unstaged: 0, untracked: 0, ahead: 0, behind: 0, commit: null },
    extensionStatuses: new Map(),
    hiddenExtensionStatusKeys: new Set(),
    customItemsById: new Map(),
    options: {},
    segmentLabels: new Map(),
    theme: {
      fg() {
        throw new Error("unexpected theme color lookup in segment test");
      },
    } satisfies ThemeLike,
    colors,
    ...overrides,
  };
}

test("subagents segment shows subagent cost when present and hides when zero", () => {
  const hidden = renderSegment("subagents", createSegmentContext());
  assert.equal(hidden.visible, false);

  const ctx = createSegmentContext({
    usageStats: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
      subagentCost: 0.12,
    },
  });
  const rendered = renderSegment("subagents", ctx);
  assert.equal(rendered.visible, true);
  assert.match(rendered.content, /\$0\.12/);
  assert.match(rendered.content, /sub/);
});

test("git segment renders upstream ahead/behind and latest commit", () => {
  const ctx = createSegmentContext({
    git: {
      branch: "main",
      staged: 0,
      unstaged: 0,
      untracked: 0,
      ahead: 2,
      behind: 1,
      commit: { short: "abc1234", subject: "Fix things properly" },
    },
  });
  const rendered = renderSegment("git", ctx);
  assert.equal(rendered.visible, true);
  assert.match(rendered.content, /↑2 ↓1/);
  assert.match(rendered.content, /abc1234/);
  assert.match(rendered.content, /Fix things properly/);
});

test("git segment hides commit/ahead-behind when disabled", () => {
  const ctx = createSegmentContext({
    options: { git: { showCommit: false, showAheadBehind: false } },
    git: {
      branch: "main",
      staged: 0,
      unstaged: 0,
      untracked: 0,
      ahead: 5,
      behind: 3,
      commit: { short: "abc1234", subject: "Secret commit" },
    },
  });
  const rendered = renderSegment("git", ctx);
  assert.equal(rendered.visible, true);
  assert.doesNotMatch(rendered.content, /abc1234/);
  assert.doesNotMatch(rendered.content, /↑5|↓3/);
});

test("tps segment honors the POWERLINE_TPS override", () => {
  process.env.POWERLINE_TPS = "42";
  try {
    const rendered = renderSegment("tps", createSegmentContext());
    assert.equal(rendered.visible, true);
    assert.match(rendered.content, /42/);
  } finally {
    delete process.env.POWERLINE_TPS;
  }
});

test("parseOpenPortProcesses maps ss -tulnp rows to port→process and dedupes dual-stack", () => {
  const text = [
    "Netid State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process",
    'tcp   LISTEN 0      128    0.0.0.0:22         0.0.0.0:*         users:(("sshd",pid=1071,fd=3))',
    'tcp   LISTEN 0      511    [::]:22            [::]:*            users:(("sshd",pid=1071,fd=4))',
    'tcp   LISTEN 0      511    127.0.0.1:3000     0.0.0.0:*         users:(("node",pid=12345,fd=24))',
    'udp   UNCONN 0      0      127.0.0.53%lo:53   0.0.0.0:*         users:(("systemd-resolve",pid=532,fd=12))',
  ].join("\n");
  const ports = parseOpenPortProcesses(text);
  assert.deepEqual(
    ports.map((p) => [p.proto, p.port, p.process]),
    [
      ["tcp", 22, "sshd (1071)"],
      ["udp", 53, "systemd-resolve (532)"],
      ["tcp", 3000, "node (12345)"],
    ],
  );
});

test("parseOpenPortProcesses keeps ss rows without a visible process owner", () => {
  const text = [
    "Netid State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process",
    "tcp   LISTEN 0      511    0.0.0.0:3000        0.0.0.0:*",
  ].join("\n");
  const ports = parseOpenPortProcesses(text);
  assert.equal(ports.length, 1);
  assert.deepEqual(ports[0], {
    port: 3000,
    proto: "tcp",
    address: "0.0.0.0",
    process: null,
  });
});

test("parseOpenPortProcesses falls back to netstat -tulnp format", () => {
  const text = [
    "Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name",
    "tcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN      1071/sshd",
    "udp        0      0 127.0.0.53:53           0.0.0.0:*                           532/systemd-resolve",
  ].join("\n");
  const ports = parseOpenPortProcesses(text);
  assert.deepEqual(
    ports.map((p) => [p.proto, p.port, p.process]),
    [
      ["tcp", 22, "sshd (1071)"],
      ["udp", 53, "systemd-resolve (532)"],
    ],
  );
});

test("parseOpenPortProcesses ignores headers and empty input", () => {
  assert.deepEqual(parseOpenPortProcesses(""), []);
  assert.deepEqual(parseOpenPortProcesses("Netid State Recv-Q Send-Q\n"), []);
});

test("sanitizeSshHost accepts hostnames, user@host, and IPv4", () => {
  assert.equal(sanitizeSshHost("sofie"), "sofie");
  assert.equal(sanitizeSshHost(" user@sofie.local "), "user@sofie.local");
  assert.equal(sanitizeSshHost("192.168.1.10"), "192.168.1.10");
});

test("sanitizeSshHost rejects empty, spaced, and shell-metacharacter input", () => {
  assert.equal(sanitizeSshHost(undefined), null);
  assert.equal(sanitizeSshHost(""), null);
  assert.equal(sanitizeSshHost("   "), null);
  assert.equal(sanitizeSshHost("sofie; rm -rf /"), null);
  assert.equal(sanitizeSshHost("sofie -p 2222"), null);
  assert.equal(sanitizeSshHost("sofie`id`"), null);
});

test("resolvePreset warns once and falls back to default for unknown names", () => {
  assert.equal(resolvePreset("default"), PRESETS.default);
  assert.equal(resolvePreset("compact"), PRESETS.compact);

  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(String(args[0]));
  };
  try {
    // Unknown names resolve to default with exactly one warning each.
    assert.equal(resolvePreset("definitely-not-a-preset"), PRESETS.default);
    assert.equal(resolvePreset("definitely-not-a-preset"), PRESETS.default);
    // Inherited Object names (e.g. `toString`) must NOT be treated as presets.
    assert.equal(resolvePreset("toString"), PRESETS.default);
    assert.equal(resolvePreset("toString"), PRESETS.default);
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(warnings.length, 2);
});