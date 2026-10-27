import assert from "node:assert/strict";
import test from "node:test";
import { appearanceRailPreview } from "../src/extension/ui/deck/route-bodies.ts";
import type { DeckNavState, DeckSessionSnapshot } from "../src/extension/ui/deck/types.ts";
import { stripAnsi } from "./helpers/strip-ansi.ts";

function snapshot(): DeckSessionSnapshot {
  return {
    modelLabel: "GPT-5.6",
    branchLabel: "main",
    contextPercent: 47,
    contextTokens: 94000,
    contextWindow: 200000,
    signalActivity: "idle",
    signalMotion: "wisp",
    queueCount: 0,
    ideaCount: 0,
    skillsTotal: 4,
    skillsWarnings: 0,
    policySummary: "",
    shellName: "bash",
    bashModeActive: false,
    appearanceBase: "lanternwake",
    recentActivity: [],
    nextIntent: null,
    motionLevel: "full",
  } as unknown as DeckSessionSnapshot;
}

function navState(selectedAppearance: number): DeckNavState {
  return {
    route: "appearance",
    selectedAppearance,
    searchQuery: "",
  } as unknown as DeckNavState;
}

test("appearance rail preview renders the candidate preset's own signal", () => {
  const preview = appearanceRailPreview(snapshot(), navState(0), 450);
  assert.ok(preview, "a cursor on a structural preset must preview");
  const plain = stripAnsi(preview);
  assert.doesNotMatch(plain, /\n/, "the preview is one row");
  assert.ok(plain.length > 8, `expected a rail body, got ${JSON.stringify(plain)}`);
  // Deterministic per tick: same tick, same rail.
  assert.equal(preview, appearanceRailPreview(snapshot(), navState(0), 450));
});

test("appearance rail preview differs between presets", () => {
  const a = appearanceRailPreview(snapshot(), navState(0), 450);
  const b = appearanceRailPreview(snapshot(), navState(1), 450);
  // Different structural presets can share a signal spec; if they do the
  // labels differ instead. Either way the preview must react to the cursor.
  assert.ok(
    a !== b || stripAnsi(a!) !== stripAnsi(b!),
    "moving the cursor should surface the candidate base",
  );
});

test("appearance rail preview is deterministic per tick and stays pure", () => {
  const first = appearanceRailPreview(snapshot(), navState(2), 900);
  const second = appearanceRailPreview(snapshot(), navState(2), 900);
  assert.equal(first, second);
});
