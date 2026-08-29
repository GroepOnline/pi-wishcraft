import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createStudioState,
  handleStudioKey,
  STUDIO_PANES,
  type StudioKeyEvent,
  type StudioState,
} from "../src/studio/state.ts";
import { openSkillStudio, SKILL_STUDIO_PANES_READY } from "../src/studio/open.ts";

const makeKey = (k: StudioKeyEvent["key"], char?: string): StudioKeyEvent => ({ key: k, char });

function press(state: StudioState, event: StudioKeyEvent): StudioState {
  return handleStudioKey(state, event);
}

test("normal mode: j and arrow-down move selection down", () => {
  const s0 = createStudioState();
  const s1 = press(s0, makeKey("down"));
  assert.equal(s1.selectedIndex, s0.selectedIndex + 1);
  const s2 = press(press(s0, makeKey("printable", "j")), makeKey("printable", "j"));
  assert.equal(s2.selectedIndex, s0.selectedIndex + 2);
});

test("normal mode: k and arrow-up move selection up without going negative", () => {
  const s0 = createStudioState();
  const s1 = press(s0, makeKey("up"));
  assert.equal(s1.selectedIndex, 0);
  const s2 = press(press(press(s0, makeKey("down")), makeKey("printable", "j")), makeKey("printable", "k"));
  assert.equal(s2.selectedIndex, 1);
});

test("normal mode: Tab cycles pane focus and wraps", () => {
  let s = createStudioState();
  const order = STUDIO_PANES;
  const startIdx = order.indexOf(s.focus);
  for (let i = 1; i <= order.length; i += 1) {
    s = press(s, makeKey("tab"));
    assert.equal(s.focus, order[(startIdx + i) % order.length]);
  }
});

test("normal mode: slash opens filter mode, question mark opens help", () => {
  const s0 = createStudioState();
  assert.equal(press(s0, makeKey("printable", "/")).mode, "filter");
  assert.equal(press(s0, makeKey("printable", "?")).mode, "help");
});

test("normal mode: q and escape request exit", () => {
  const s0 = createStudioState();
  assert.equal(press(s0, makeKey("printable", "q")).exitRequested, true);
  assert.equal(press(s0, makeKey("escape")).exitRequested, true);
});

test("filter mode: printables append to query, backspace removes, return commits, escape clears and closes", () => {
  const s0 = createStudioState();
  const open = press(s0, makeKey("printable", "/"));
  let s = open;
  for (const ch of "doc") s = press(s, makeKey("printable", ch));
  assert.equal(s.filterQuery, "doc");
  s = press(press(s, makeKey("printable", "t")), makeKey("backspace"));
  assert.equal(s.filterQuery, "doct".slice(0, 3));
  assert.equal(s.filterQuery, "doc");
  const committed = press(s, makeKey("return"));
  assert.equal(committed.mode, "normal");
  assert.equal(committed.filterQuery, "doc");
  const reopened = press(committed, makeKey("printable", "/"));
  const cancelled = press(reopened, makeKey("escape"));
  assert.equal(cancelled.mode, "normal");
  assert.equal(cancelled.filterQuery, "");
});

test("help mode: q, escape, and return return to normal", () => {
  const s0 = createStudioState();
  const help = press(s0, makeKey("printable", "?"));
  assert.equal(help.mode, "help");
  assert.equal(press(help, makeKey("printable", "q")).mode, "normal");
  assert.equal(press(help, makeKey("escape")).mode, "normal");
  assert.equal(press(help, makeKey("return")).mode, "normal");
});

test("filter mode: navigation keys are typed, not routed", () => {
  const s0 = createStudioState();
  const open = press(s0, makeKey("printable", "/"));
  const typed = press(open, makeKey("printable", "j"));
  assert.equal(typed.filterQuery, "j");
  assert.equal(typed.selectedIndex, open.selectedIndex);
  assert.equal(typed.mode, "filter");
});

test("help mode: navigation keys do not move selection", () => {
  const s0 = createStudioState();
  const help = press(s0, makeKey("printable", "?"));
  const idle = press(help, makeKey("down"));
  assert.equal(idle.selectedIndex, help.selectedIndex);
});

test("studio entrypoint opens once registry-backed panes are connected", async () => {
  assert.equal(SKILL_STUDIO_PANES_READY, true);
  const notices: Array<[string, string]> = [];
  let customCalls = 0;
  const rt: any = { enabled: true, currentCtx: null };
  const ctx: any = {
    hasUI: true,
    mode: "interactive",
    ui: {
      notify(message: string, level: string) {
        notices.push([message, level]);
      },
      async custom() {
        customCalls += 1;
      },
    },
  };

  await openSkillStudio(rt, ctx);

  assert.equal(customCalls, 1);
  assert.equal(rt.currentCtx, ctx);
  assert.deepEqual(notices, []);
});

test("studio modules contain only English operator strings", () => {
  const modules = [
    "../src/studio/state.ts",
    "../src/studio/component.ts",
    "../src/studio/open.ts",
  ];
  const dutchPattern = /\b(kies|bevestig|annuleer|sluit|zoek|vaardighed|overzicht|instellingen|foutmelding)\b/i;
  for (const rel of modules) {
    const src = readFileSync(join(import.meta.dirname, rel), "utf8");
    assert.match(src, /[\w\s]/);
    assert.doesNotMatch(src, dutchPattern, `${rel} must keep operator strings English`);
  }
});
