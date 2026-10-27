import assert from "node:assert/strict";
import { test } from "node:test";

import {
  deckFooter,
  renderDeckFrame,
} from "../src/extension/ui/deck/render.ts";
import {
  deckPortsOptions,
  filteredIdeas,
  guardrailLines,
  ideasLines,
  portsLines,
} from "../src/extension/ui/deck/route-bodies.ts";
import { invalidatePortsCache, peekPorts } from "../src/segments/ports.ts";
import { DEFAULT_SHORTCUTS } from "../src/extension/core/constants.ts";
import type {
  DeckIdeaRow,
  DeckNavState,
  DeckSessionSnapshot,
} from "../src/extension/ui/deck/types.ts";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
};

function ideaRows(count: number): DeckIdeaRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `idea-${i}`,
    text: `Idea number ${i}`,
    reviewStatus: i % 3 === 0 ? "done" : "idea",
  }));
}

function snapshotWith(overrides: Partial<DeckSessionSnapshot> = {}): DeckSessionSnapshot {
  return {
    modelLabel: "m",
    branchLabel: "main",
    contextPercent: 10,
    contextTokens: 1000,
    contextWindow: 100000,
    signalActivity: "idle",
    signalMotion: "ember-relay",
    queueCount: 0,
    ideaCount: 0,
    skillsTotal: 4,
    skillsWarnings: 0,
    policyEnabled: true,
    policyRuleCount: 3,
    shellName: null,
    bashModeActive: false,
    appearanceBase: "lanternwake",
    recentActivity: ["read_file"],
    nextIntent: null,
    motionLevel: "full",
    policySummary: "motion full",
    skills: [],
    ideas: [],
    guardrailRules: [],
    ...overrides,
  };
}

function navState(overrides: Partial<DeckNavState> = {}): DeckNavState {
  return {
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
    skillWizard: null,
    navMode: false,
    ...overrides,
  };
}

test("the ports route reports it is probing when the cache is cold", () => {
  invalidatePortsCache();
  const lines = portsLines(80, deckPortsOptions());
  assert.ok(lines.length > 0);
  assert.match(lines.join("\n"), /Probing|probing/);
  // Reading the route must never spawn a process during a render.
  assert.equal(peekPorts(deckPortsOptions()), null);
});

test("a long ideas queue cannot grow the frame past its budget", () => {
  const snapshot = snapshotWith({ ideas: ideaRows(60), ideaCount: 60 });
  const lines = renderDeckFrame(
    theme as never,
    96,
    snapshot,
    navState({ route: "ideas" }),
    DEFAULT_SHORTCUTS,
  );

  // chrome (5) + max(MAX_NAV_ROWS, MAX_CENTER_ROWS, MAX_RIGHT_ROWS)
  assert.ok(lines.length <= 22, `frame grew to ${lines.length} lines`);
  // The ideas body windows itself rather than relying on the frame clip.
  assert.match(lines.join("\n"), /… 52 below/);
});

test("ideas window around the cursor instead of dumping the whole list", () => {
  const snapshot = snapshotWith({ ideas: ideaRows(40), ideaCount: 40 });

  const top = ideasLines(snapshot, navState({ route: "ideas" }));
  assert.match(top.join("\n"), /… 32 below/);
  assert.doesNotMatch(top.join("\n"), /above/);
  assert.match(top.join("\n"), /Idea number 0/);

  const middle = ideasLines(
    snapshot,
    navState({ route: "ideas", selectedIdea: 20 }),
  );
  const joined = middle.join("\n");
  assert.match(joined, /… 16 above/);
  assert.match(joined, /… 16 below/);
  // The 1-char marker replaces the leading space so columns stay aligned.
  assert.match(joined, /→\[idea\] Idea number 20/);
  assert.doesNotMatch(joined, /Idea number 0\b/);

  const bottom = ideasLines(
    snapshot,
    navState({ route: "ideas", selectedIdea: 39 }),
  );
  assert.match(bottom.join("\n"), /… 32 above/);
  assert.doesNotMatch(bottom.join("\n"), /below/);
});

test("the Deck search filters ideas in place", () => {
  const snapshot = snapshotWith({
    ideas: ideaRows(10),
    ideaCount: 10,
  });
  const state = navState({ route: "ideas", searchQuery: "3" });
  const lines = ideasLines(snapshot, state);
  const joined = lines.join("\n");

  assert.match(joined, /1 match '3'/);
  assert.match(joined, /Idea number 3/);
  assert.doesNotMatch(joined, /Idea number 30|Idea number 13\b/);

  // Outside the ideas route the same query must not filter the list.
  const homeLines = ideasLines(
    snapshot,
    navState({ route: "home", searchQuery: "3" }),
  );
  assert.equal(homeLines.filter((line) => line.includes("Idea number")).length, 8);
});

test("filteredIdeas and ideasLines agree", () => {
  const snapshot = snapshotWith({ ideas: ideaRows(5), ideaCount: 5 });
  const state = navState({ route: "ideas", searchQuery: "2" });
  assert.equal(filteredIdeas(snapshot, state).length, 1);
  assert.equal(
    ideasLines(snapshot, state).filter((line) => line.includes("Idea number")).length,
    1,
  );
});

test("guardrail lists are capped with an overflow count", () => {
  const snapshot = snapshotWith({
    policyEnabled: false,
    policyRuleCount: 40,
    guardrailRules: Array.from({ length: 40 }, (_, i) => ({
      action: i % 2 === 0 ? "deny" : "allow",
      tool: `tool${i}`,
      reason: `reason ${i}`,
    })),
  });

  const lines = guardrailLines(snapshot);
  assert.match(lines[0]!, /Policy: OFF \(40 rules\)/);
  assert.match(lines.join("\n"), /… 30 more/);
  assert.ok(lines.length <= 14, `guardrail body grew to ${lines.length} lines`);

  const empty = guardrailLines(snapshotWith());
  assert.match(empty.join("\n"), /No declarative rules/);
});

test("the frame carries the new ports route with its own footer", () => {
  const lines = renderDeckFrame(
    theme as never,
    96,
    snapshotWith(),
    navState({ route: "ports" }),
    DEFAULT_SHORTCUTS,
  );
  const body = lines.join("\n");
  assert.match(body, /PORTS|Ports/);
  assert.match(deckFooter(navState({ route: "ports" })), /r re-probe/);
  assert.match(deckFooter(navState({ route: "ideas" })), /enter status/);
});

test("the right rail only spends space on alerts when there is one", () => {
  const quiet = renderDeckFrame(
    theme as never,
    96,
    snapshotWith({ skillsWarnings: 0, contextPercent: 20 }),
    navState(),
    DEFAULT_SHORTCUTS,
  ).join("\n");
  assert.doesNotMatch(quiet, /ATTENTION/);
  assert.match(quiet, /ACTIVITY FEED/);

  const loud = renderDeckFrame(
    theme as never,
    96,
    snapshotWith({
      skillsWarnings: 3,
      policyEnabled: false,
      contextPercent: 95,
    }),
    navState(),
    DEFAULT_SHORTCUTS,
  ).join("\n");
  assert.match(loud, /ATTENTION/);
  // The right rail is ~22 columns wide, so match on the surviving prefix.
  assert.match(loud, /3 skills need/);
  assert.match(loud, /guardrails are/);
  assert.match(loud, /context 95%/);
});
