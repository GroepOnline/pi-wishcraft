import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DECK_ROUTE_DEFS,
  deckRouteByJump,
  isDeckRoute,
  parseDeckRouteArg,
} from "../src/extension/ui/deck/routes.ts";
import { DECK_ROUTES } from "../src/extension/ui/deck/types.ts";
import {
  filterDeckRoutes,
  renderDeckFrame,
} from "../src/extension/ui/deck/render.ts";
import type { DeckNavState, DeckSessionSnapshot } from "../src/extension/ui/deck/types.ts";
import { DEFAULT_SHORTCUTS } from "../src/extension/core/constants.ts";

const snapshot: DeckSessionSnapshot = {
  modelLabel: "GPT-5.6",
  branchLabel: "main",
  contextPercent: 47,
  contextTokens: 94000,
  contextWindow: 200000,
  signalActivity: "streaming",
  signalMotion: "ember-relay",
  queueCount: 1,
  ideaCount: 4,
  skillsTotal: 27,
  skillsWarnings: 2,
  policyEnabled: true,
  policyRuleCount: 3,
  shellName: "bash",
  bashModeActive: false,
  appearanceBase: "lanternwake",
  recentActivity: ["read_file", "grep_pattern"],
  nextIntent: "Improve Signal motion engine",
};

const navState: DeckNavState = {
  route: "home",
  selectedNav: 0,
  searchOpen: false,
  searchQuery: "",
  pendingJump: null,
};

const theme = {
  fg: (color: string, text: string) => `[${color}]${text}[/]`,
  bold: (text: string) => text,
};

test("deck exposes eleven routes", () => {
  assert.equal(DECK_ROUTES.length, 11);
  assert.equal(DECK_ROUTE_DEFS.length, 11);
});

test("parseDeckRouteArg resolves named routes", () => {
  assert.equal(parseDeckRouteArg(""), "home");
  assert.equal(parseDeckRouteArg("skills"), "skills");
  assert.equal(parseDeckRouteArg("motion gallery"), "motion");
  assert.equal(parseDeckRouteArg("unknown"), "home");
});

test("jump keys follow posting-style g-prefix ergonomics", () => {
  assert.equal(deckRouteByJump("h"), "home");
  assert.equal(deckRouteByJump("s"), "signal");
  assert.equal(deckRouteByJump("i"), "ideas");
  assert.equal(deckRouteByJump("a"), "appearance");
  assert.equal(deckRouteByJump("m"), "motion");
});

test("filterDeckRoutes matches labels and ids", () => {
  const matches = filterDeckRoutes("guard");
  assert.ok(matches.includes("guardrails"));
  assert.ok(isDeckRoute("diagnostics"));
});

test("renderDeckFrame draws a single continuous outer frame", () => {
  const lines = renderDeckFrame(theme as never, 96, snapshot, navState, DEFAULT_SHORTCUTS);
  assert.ok(lines[0]?.includes("╭"));
  assert.ok(lines.at(-1)?.includes("╯"));
  assert.ok(lines.some((line) => line.includes("GPT-5.6")));
  assert.ok(lines.some((line) => line.includes("NEXT INTENT")));
  assert.ok(lines.some((line) => line.includes("ACTIVITY FEED")));
});

test("home route shows context bar without raw cost counters", () => {
  const lines = renderDeckFrame(theme as never, 96, snapshot, navState, DEFAULT_SHORTCUTS);
  const body = lines.join("\n");
  assert.match(body, /47%/);
  assert.doesNotMatch(body, /\$[0-9]/);
});
