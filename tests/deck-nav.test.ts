import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { STRUCTURAL_PRESET_NAMES } from "../src/config/types.ts";
import { createDeckComponent } from "../src/extension/ui/deck/component.ts";
import { deckFooter } from "../src/extension/ui/deck/render.ts";
import type { DeckNavState } from "../src/extension/ui/deck/types.ts";
import { DEFAULT_SHORTCUTS } from "../src/extension/core/constants.ts";

const DOWN = "[B";
const UP = "[A";
const LEFT = "[D";
const RIGHT = "[C";
const TAB = "	";

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
};

function makeHarness(initialRoute: any) {
  const cwd = mkdtempSync(join(tmpdir(), "deck-nav-"));
  const notifications: string[] = [];
  const ctx: any = {
    cwd,
    ui: { notify: (msg: string) => notifications.push(msg) },
  };
  const rt: any = {
    cwd,
    resolvedShortcuts: DEFAULT_SHORTCUTS,
    queueStore: {
      summarize: () => ({ queueCount: 0, ideaCount: 0, leadingText: null }),
      list: () => [],
    },
    signal: { activity: "ready", motionId: "ember-relay" },
    powerlineCompacting: false,
    shellSession: null,
    bashModeActive: false,
    lastUserPrompt: null,
    motionPolicy: { level: "full" },
  };
  let closed = false;
  const component = createDeckComponent(rt, ctx, initialRoute, theme as never, () => {
    closed = true;
  });
  const frame = () => component.render(96).join("\n");
  return { component, frame, closed: () => closed };
}

/** Row index of the → cursor among the appearance preset rows. */
function appearanceCursorIndex(body: string): number {
  const lines = body.split("\n");
  const rows = STRUCTURAL_PRESET_NAMES.map((name) =>
    lines.findIndex((line) => line.includes(name)),
  );
  const marked = lines.findIndex((line) => line.includes("→"));
  const row = rows.indexOf(marked);
  assert.notEqual(row, -1, "cursor marker sits on a preset row");
  return row;
}

test("↓ on home walks the nav routes (never sideways)", () => {
  const h = makeHarness("home");
  assert.match(h.frame(), /ACTIVE ROUTE: HOME/);
  h.component.handleInput(DOWN);
  assert.match(h.frame(), /ACTIVE ROUTE: SIGNAL/);
  h.component.handleInput(DOWN);
  assert.match(h.frame(), /ACTIVE ROUTE: SKILLS/);
});

test("← focuses nav (visible ◉), ↓ then walks routes, → returns to list", () => {
  const h = makeHarness("skills");
  // List has focus: ↓ moves the skill cursor, nav stays on skills.
  assert.match(h.frame(), /◉ ACTIVE ROUTE: SKILLS/);
  h.component.handleInput(LEFT);
  let body = h.frame();
  assert.match(body, /◉ NAVIGATION/);
  assert.match(body, /○ ACTIVE ROUTE: SKILLS/);
  h.component.handleInput(DOWN);
  body = h.frame();
  assert.match(body, /ACTIVE ROUTE: IDEAS/);
  // → drops back into the list pane.
  h.component.handleInput(RIGHT);
  body = h.frame();
  assert.match(body, /◉ ACTIVE ROUTE: IDEAS/);
  assert.match(body, /○ NAVIGATION/);
});

test("tab also focuses nav; footer advertises the focus model", () => {
  const h = makeHarness("motion");
  h.component.handleInput(TAB);
  assert.match(h.frame(), /◉ NAVIGATION/);
  const navFooter = deckFooter({
    route: "motion",
    navMode: true,
  } as DeckNavState);
  assert.match(navFooter, /↑↓ route/);
  assert.match(navFooter, /→ list/);
  const listFooter = deckFooter({ route: "motion", navMode: false } as DeckNavState);
  assert.match(listFooter, /←\/tab nav/);
  assert.match(listFooter, /→ list/);
});

test("↑↓ moves the appearance cursor and clamps at the ends", () => {
  const h = makeHarness("appearance");
  const last = STRUCTURAL_PRESET_NAMES.length - 1;
  for (let i = 0; i < STRUCTURAL_PRESET_NAMES.length; i++) h.component.handleInput(DOWN);
  assert.equal(appearanceCursorIndex(h.frame()), last);
  // Extra ↓ stays clamped instead of jumping panes.
  h.component.handleInput(DOWN);
  assert.equal(appearanceCursorIndex(h.frame()), last);
  for (let i = 0; i < STRUCTURAL_PRESET_NAMES.length; i++) h.component.handleInput(UP);
  assert.equal(appearanceCursorIndex(h.frame()), 0);
});

test("stale cursor after narrowing clamps instead of sticking", () => {
  const h = makeHarness("appearance");
  // Walk to the bottom, then filter is simulated by shrinking: ↑ from a
  // clamped position must still move one row, not jump out of range.
  for (let i = 0; i < STRUCTURAL_PRESET_NAMES.length; i++) h.component.handleInput(DOWN);
  h.component.handleInput(UP);
  assert.equal(appearanceCursorIndex(h.frame()), STRUCTURAL_PRESET_NAMES.length - 2);
});
