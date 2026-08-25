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
  deckFooter,
  filterDeckRoutes,
  renderDeckFrame,
} from "../src/extension/ui/deck/render.ts";
import { filterSkillRows } from "../src/extension/ui/deck/route-bodies.ts";
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
  motionLevel: "full",
  policySummary: "motion full",
  skills: [
    { name: "wishcraft-tui", category: "project", status: "ok", description: "TUI design skill", usage: 4 },
    { name: "review", category: "global", status: "warn", description: "Review checklist", usage: 0 },
  ],
  ideas: [{ text: "Ship the Motion Gallery", reviewStatus: "in-progress" }],
  guardrailRules: [{ action: "deny", tool: "bash", reason: "destructive rm" }],
};

const navState: DeckNavState = {
  route: "home",
  selectedNav: 0,
  searchOpen: false,
  searchQuery: "",
  pendingJump: null,
  selectedAppearance: 0,
  selectedMotion: 0,
  selectedSkill: 0,
  selectedIdea: 0,
  composerOpen: false,
  composerField: 0,
  assignEvent: "streaming",
  skillCreate: false,
  skillCreateName: "",
  navMode: false,
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
  assert.equal(parseDeckRouteArg("settings"), "appearance");
  assert.equal(parseDeckRouteArg("config"), "appearance");
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
  assert.match(body, /Lanternwake · ember-relay · full/);
});

test("signal route names the three lanes", () => {
  const lines = renderDeckFrame(
    theme as never,
    96,
    snapshot,
    { ...navState, route: "signal", selectedNav: 1 },
    DEFAULT_SHORTCUTS,
  );
  const body = lines.join("\n");
  assert.match(body, /THREE LANES/);
  assert.match(body, /Identity · Activity · Context/);
  assert.match(body, /Lanternwake/);
});

test("deckFooter is route-specific", () => {
  assert.match(deckFooter({ ...navState, route: "appearance" }), /select base/);
  assert.match(deckFooter({ ...navState, route: "motion" }), /composer/);
  assert.match(deckFooter({ ...navState, route: "skills" }), /n new/);
  assert.match(deckFooter({ ...navState, route: "ideas" }), /idea/);
  assert.match(deckFooter({ ...navState, composerOpen: true }), /nudge/);
  assert.match(deckFooter({ ...navState, skillCreate: true }), /create/);
  assert.match(deckFooter({ ...navState, searchOpen: true, searchQuery: "hex" }), /\/ hex_/);
  // one-press return to the NAVIGATION column is advertised on list routes
  assert.match(deckFooter({ ...navState, route: "skills" }), /←\/tab nav/);
  assert.match(deckFooter({ ...navState, route: "motion" }), /←\/tab nav/);
});

test("filterSkillRows matches name, category, and description", () => {
  assert.equal(filterSkillRows(snapshot.skills, "").length, 2);
  assert.equal(filterSkillRows(snapshot.skills, "tui").length, 1);
  assert.equal(filterSkillRows(snapshot.skills, "global").length, 1);
  assert.equal(filterSkillRows(snapshot.skills, "no-such-skill").length, 0);
});

test("motion route lists the gallery with a live preview strip", () => {
  const lines = renderDeckFrame(
    theme as never,
    96,
    snapshot,
    { ...navState, route: "motion", selectedNav: 8, selectedMotion: 0 },
    DEFAULT_SHORTCUTS,
  );
  const body = lines.join("\n");
  assert.match(body, /Ember Relay|ember-relay|Wishcraft/i);
  assert.match(body, /composer/i);
  assert.match(body, /assign streaming/);
  assert.match(body, /wishcraft \d+/);
});

test("motion gallery tick is injectable", () => {
  const a = renderDeckFrame(
    theme as never,
    96,
    snapshot,
    { ...navState, route: "motion", selectedNav: 8 },
    DEFAULT_SHORTCUTS,
    null,
    0,
  ).join("\n");
  const b = renderDeckFrame(
    theme as never,
    96,
    snapshot,
    { ...navState, route: "motion", selectedNav: 8 },
    DEFAULT_SHORTCUTS,
    null,
    0,
  ).join("\n");
  assert.equal(a, b);
});

test("skills create mode shows the inline name wizard", () => {
  const lines = renderDeckFrame(
    theme as never,
    96,
    snapshot,
    { ...navState, route: "skills", skillCreate: true, skillCreateName: "lantern" },
    DEFAULT_SHORTCUTS,
  );
  const body = lines.join("\n");
  assert.match(body, /NEW SKILL/);
  assert.match(body, /lantern/);
});

test("skills route renders the workbench list", () => {
  const lines = renderDeckFrame(
    theme as never,
    96,
    snapshot,
    { ...navState, route: "skills", selectedNav: 2 },
    DEFAULT_SHORTCUTS,
  );
  const body = lines.join("\n");
  assert.match(body, /WORKBENCH/);
  assert.match(body, /wishcraft-tui/);
});

test("appearance route lists structural bases with a cursor", () => {
  const lines = renderDeckFrame(
    theme as never,
    96,
    snapshot,
    { ...navState, route: "appearance", selectedNav: 7, selectedAppearance: 5 },
    DEFAULT_SHORTCUTS,
  );
  const body = lines.join("\n");
  assert.match(body, /hexforge/);
  assert.match(body, /lanternwake/);
  assert.match(body, /Hexforge/);
  assert.match(body, /Lanternwake/);
  assert.match(body, /enter apply/i);
  assert.match(body, /→/);
});
