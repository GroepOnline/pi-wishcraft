import assert from "node:assert/strict";
import { test } from "node:test";
import {
  detectNoColor,
  detectTerminalCapabilities,
} from "../src/theme/detect.ts";
import {
  cycleMotionLevel,
  describeMotionLevel,
  effectiveFps,
  isMotionLevel,
  motionPolicyFromEnvironment,
  parseMotionSettings,
  screenReaderStatus,
  shouldAnimateSignal,
  shouldUseAscii,
  shouldUseColor,
  stableStateMarker,
} from "../src/motion/accessibility.ts";
import { allowedChannels, targetFps, DEFAULT_MOTION_POLICY } from "../src/motion/index.ts";
import { renderDeckFrame } from "../src/extension/ui/deck/render.ts";
import { DEFAULT_SHORTCUTS } from "../src/extension/core/constants.ts";
import type { DeckNavState, DeckSessionSnapshot } from "../src/extension/ui/deck/types.ts";
import { createSignalRuntime } from "../src/signal/controller.ts";
import { renderActivity } from "../src/signal/render.ts";
import { getStructuralPreset } from "../src/config/structural-presets.ts";

test("NO_COLOR and TERM=dumb change detected capabilities", () => {
  assert.equal(detectNoColor({ NO_COLOR: "1" }), true);
  assert.equal(detectNoColor({ NO_COLOR: "" }), false);
  const dumb = detectTerminalCapabilities({ TERM: "dumb" });
  assert.equal(dumb.dumb, true);
  assert.equal(dumb.lowColor, true);
  assert.equal(dumb.asciiPreferred, true);
  const rich = detectTerminalCapabilities({
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
  });
  assert.equal(rich.truecolor, true);
  assert.equal(rich.color256, true);
  assert.equal(rich.lowColor, false);
  const linux = detectTerminalCapabilities({ TERM: "linux" });
  assert.equal(linux.lowColor, true);
});

test("TERM=screen is not treated as a screen reader", () => {
  const caps = detectTerminalCapabilities({ TERM: "screen" });
  assert.equal(caps.screenReader, false);
  const reader = detectTerminalCapabilities({ WISHCRAFT_SCREEN_READER: "1" });
  assert.equal(reader.screenReader, true);
});

test("environment maps onto a MotionPolicy that changes render decisions", () => {
  const policy = motionPolicyFromEnvironment(
    {
      NO_COLOR: "1",
      WISHCRAFT_REDUCED_MOTION: "1",
      WISHCRAFT_SCREEN_READER: "1",
      TERM: "dumb",
    },
    parseMotionSettings({ motion: { level: "full" } }),
  );
  assert.equal(policy.noColor, true);
  assert.equal(policy.screenReader, true);
  assert.equal(policy.reducedMotion, true);
  assert.equal(policy.lowColor, true);
  assert.equal(shouldAnimateSignal("streaming", policy), false);
  assert.equal(shouldUseColor(policy, true), false);
  assert.equal(shouldUseAscii(policy, true), true);
  assert.equal(effectiveFps(policy, 3), 0);
  assert.equal(allowedChannels("streaming", policy).length, 0);
});

test("motion levels Full/Reduced/Functional/Off are distinct", () => {
  assert.equal(isMotionLevel("full"), true);
  assert.equal(cycleMotionLevel("full"), "reduced");
  assert.equal(cycleMotionLevel("off"), "full");
  assert.match(describeMotionLevel("off"), /zero animated frames/i);

  const reduced = { ...DEFAULT_MOTION_POLICY, level: "reduced" as const };
  assert.equal(shouldAnimateSignal("streaming", reduced), false);
  assert.ok(allowedChannels("streaming", reduced).includes("workingGlyph"));

  const functional = { ...DEFAULT_MOTION_POLICY, level: "functional" as const };
  assert.deepEqual(allowedChannels("streaming", functional), [
    "workingGlyph",
    "panelIndicator",
  ]);

  const off = { ...DEFAULT_MOTION_POLICY, level: "off" as const };
  assert.equal(allowedChannels("streaming", off).length, 0);
  assert.equal(targetFps(off, ["signal"], ["signal"]), 0);
  assert.equal(stableStateMarker("success", true), "[ok]");
});

test("screen-reader status is stable high-contrast text", () => {
  assert.equal(
    screenReaderStatus({
      model: "GPT-5.6",
      git: "main (clean)",
      event: "streaming",
      contextPercent: 47,
    }),
    "Model: GPT-5.6 | Git: main (clean) | State: streaming | Context: 47%",
  );
});

test("signal toggle off keeps a still rail while full motion travels", () => {
  const signal = createSignalRuntime(0);
  signal.event = "streaming";
  signal.activity = "streaming";
  signal.active = true;
  signal.motionId = "ember-relay";
  const spec = getStructuralPreset("lanternwake").signal;
  const strip = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, "");

  const full = { ...DEFAULT_MOTION_POLICY };
  const a = strip(renderActivity({ ...signal, tick: 2 }, spec, true, full));
  const b = strip(renderActivity({ ...signal, tick: 5 }, spec, true, full));
  assert.notEqual(a, b);

  const toggled = {
    ...DEFAULT_MOTION_POLICY,
    toggles: { ...DEFAULT_MOTION_POLICY.toggles, signal: false },
  };
  const c = strip(renderActivity({ ...signal, tick: 2 }, spec, true, toggled));
  const d = strip(renderActivity({ ...signal, tick: 5 }, spec, true, toggled));
  assert.equal(c, d);
  assert.match(c, /------/);
});

test("Deck render output changes under screen-reader and stays framed otherwise", () => {
  const snapshot: DeckSessionSnapshot = {
    modelLabel: "GPT-5.6",
    branchLabel: "main",
    contextPercent: 47,
    contextTokens: 1,
    contextWindow: 2,
    signalActivity: "ready",
    signalMotion: "ember-relay",
    queueCount: 0,
    ideaCount: 0,
    skillsTotal: 0,
    skillsWarnings: 0,
    policyEnabled: false,
    policyRuleCount: 0,
    shellName: null,
    bashModeActive: false,
    appearanceBase: "lanternwake",
    recentActivity: [],
    nextIntent: null,
  };
  const nav: DeckNavState = {
    route: "home",
    selectedNav: 0,
    searchOpen: false,
    searchQuery: "",
    pendingJump: null,
  };
  const theme = { fg: (_c: string, t: string) => t, bold: (t: string) => t };
  const normal = renderDeckFrame(theme as never, 80, snapshot, nav, DEFAULT_SHORTCUTS);
  const reader = renderDeckFrame(
    theme as never,
    80,
    snapshot,
    nav,
    DEFAULT_SHORTCUTS,
    { ...DEFAULT_MOTION_POLICY, screenReader: true },
  );
  assert.notEqual(normal.join("\n"), reader.join("\n"));
  assert.match(normal[0] ?? "", /╭/);
  assert.match(reader.join("\n"), /Wishcraft Deck/);
});
