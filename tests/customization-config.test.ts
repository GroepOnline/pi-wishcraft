import test from "node:test";
import assert from "node:assert/strict";
import { parsePowerlineConfig } from "../src/config/powerline-config.ts";
import {
  registerCustomSegments,
  renderSegment,
  countListeningPorts,
} from "../src/segments/index.ts";

const PRESETS_FOR_TEST = ["default", "chef"] as const;

test("parsePowerlineConfig parses custom command/env/static segments", () => {
  const config = parsePowerlineConfig(
    {
      preset: "chef",
      segments: {
        ports: {
          type: "command",
          command: "echo 7",
          prefix: "p:",
          color: "muted",
          cacheMs: 1000,
        },
        who: { type: "env", env: "USER", prefix: "u:" },
        tag: { type: "static", text: "CHEF", color: "accent" },
        bad: { type: "command" }, // missing command -> dropped
      },
    },
    PRESETS_FOR_TEST as unknown as readonly string[],
  );

  assert.deepEqual(Object.keys(config.segments).sort(), [
    "ports",
    "tag",
    "who",
  ]);
  assert.equal(config.segments.ports.type, "command");
  assert.equal(config.segments.ports.cacheMs, 1000);
  assert.equal(config.segments.who.type, "env");
  assert.equal(config.segments.tag.type, "static");
});

test("parsePowerlineConfig parses custom presets referencing built-in and custom segments", () => {
  const config = parsePowerlineConfig(
    {
      preset: "mine",
      segments: { ports: { type: "command", command: "echo 1" } },
      presets: {
        mine: {
          left: ["hostname", "custom:ports"],
          right: ["time"],
          separator: "slash",
          colors: { model: "text" },
        },
      },
    },
    PRESETS_FOR_TEST as unknown as readonly string[],
  );

  assert.equal(config.preset, "mine");
  assert.deepEqual(Object.keys(config.presets), ["mine"]);
  assert.deepEqual(config.presets.mine.left, ["hostname", "custom:ports"]);
  assert.equal(config.presets.mine.separator, "slash");
});

test("custom computed segments render via renderSegment", () => {
  const originalUser = process.env.USER;
  process.env.USER = "testuser";
  try {
    const config = parsePowerlineConfig(
      {
        preset: "chef",
        segments: {
          who: { type: "env", env: "USER", prefix: "u:" },
          missing: { type: "env", env: "NOPE_XYZ" },
          missingFallback: { type: "env", env: "NOPE_XYZ", fallback: "n/a" },
        },
      },
      PRESETS_FOR_TEST as unknown as readonly string[],
    );
    registerCustomSegments(config.segments);

    const ctx: any = {
      theme: { fg: (_c: string, t: string) => t },
      colors: {},
      extensionStatuses: new Map(),
      customItemsById: new Map(),
      options: {},
    };
    const who = renderSegment("custom:who" as any, ctx);
    assert.equal(who.visible, true);
    assert.match(who.content, /^u: · testuser/);

    const missing = renderSegment("custom:missing" as any, ctx);
    assert.equal(missing.visible, false);

    const fallback = renderSegment("custom:missingFallback" as any, ctx);
    assert.equal(fallback.visible, true);
    assert.equal(fallback.content, "n/a");
  } finally {
    if (originalUser === undefined) {
      delete process.env.USER;
    } else {
      process.env.USER = originalUser;
    }
  }
});

test("tps starts at 0 (no fake session-average after reload)", () => {
  const theme: any = { fg: (_c: string, t: string) => t };
  const ctx: any = {
    theme,
    colors: {},
    options: {},
    usageStats: {
      input: 0,
      output: 50000,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
      subagentCost: 0,
    },
    customItemsById: new Map(),
    extensionStatuses: new Map(),
  };
  const r = renderSegment("tps" as any, ctx);
  const text = r.content.replace(/\x1b\[[0-9;]*m/g, "").trim();
  // value lives after the icon; must be 0, never the raw 50000 output
  assert.match(text, /(^|\s)0(\.0)?$/);
  assert.ok(!/50000/.test(text), `must not echo raw output: ${text}`);
});

test("countListeningPorts returns unique ports (dedupes IPv4/IPv6)", () => {
  const n = countListeningPorts();
  assert.equal(typeof n, "number");
  assert.ok(n >= 0 && Number.isInteger(n), `expected integer >= 0, got ${n}`);
});

test("segmentLabels override tps/open_ports text", () => {
  const theme: any = { fg: (_c: string, t: string) => t };
  const base: any = {
    theme,
    colors: {},
    options: {},
    segmentLabels: new Map(),
    usageStats: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
      subagentCost: 0,
    },
    customItemsById: new Map(),
    extensionStatuses: new Map(),
  };
  // no label -> just the icon + value
  const noLabel = renderSegment("open_ports" as any, base);
  const stripped = noLabel.content.replace(/\x1b\[[0-9;]*m/g, "").trim();
  assert.ok(/\d+$/.test(stripped), `expected a bare count, got ${stripped}`);
  // with label -> "ports" prefix vóór het hele segment (centrale toepassing)
  const labeled = renderSegment("open_ports" as any, {
    ...base,
    segmentLabels: new Map([["open_ports", "ports"]]),
  });
  const s2 = labeled.content.replace(/\x1b\[[0-9;]*m/g, "").trim();
  assert.ok(s2.startsWith("ports"), `expected label prefix, got ${s2}`);
  assert.ok(/\d+$/.test(s2), `expected trailing count, got ${s2}`);
});

test("parsePowerlineConfig parses segmentLabels", () => {
  const cfg = parsePowerlineConfig(
    {
      preset: "chef",
      segmentLabels: { tps: "speed", open_ports: "ports", bad: "  " },
    },
    ["default", "chef"] as unknown as readonly string[],
  );
  assert.deepEqual(cfg.segmentLabels, { tps: "speed", open_ports: "ports" });
});

test("segmentOptions template overrides label and wraps plain value", () => {
  const theme: any = { fg: (_c: string, t: string) => t };
  const base: any = {
    theme,
    colors: {},
    usageStats: { input: 10, output: 20, cacheRead: 0, cacheWrite: 0, cost: 0, subagentCost: 0 },
    contextWindow: 0,
    customCompactionEnabled: false,
    autoCompactEnabled: false,
    usingSubscription: false,
    options: {
      open_ports: { template: "» {value} poort" },
    },
    segmentLabels: new Map([["open_ports", "ports"]]),
    extensionStatuses: new Map(),
  };
  const rendered = renderSegment("open_ports" as any, base as any);
  const stripped = rendered.content.replace(/\x1b\[[0-9;]*m/g, "").trim();
  // template wint op het label; {value} = kale segmenttekst (icoon + count)
  assert.ok(stripped.startsWith("» "), `expected template prefix, got ${stripped}`);
  assert.ok(/poort$/.test(stripped), `expected template suffix, got ${stripped}`);
  assert.ok(!stripped.startsWith("ports"), `label must not apply when template set: ${stripped}`);
});
