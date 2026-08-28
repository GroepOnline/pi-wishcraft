import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesKey, Key } from "@earendil-works/pi-tui";

import { createStudioComponent } from "../src/studio/component.ts";
import { openSkillStudio } from "../src/studio/open.ts";
import {
  createStudioState,
  DEFAULT_CONFIG,
  reduceStudio,
} from "../src/studio/state.ts";
import type { StudioState } from "../src/studio/types.ts";

// Terminal byte sequences the way the pi-tui router delivers them to
// `handleInput` (see existing bash-mode editor tests for this contract).
const ESC = "\x1b";
const ENTER = "\r";
const TAB = "\t";
const BACKSPACE = "\x7f";
const CTRL_U = "\x15";
const CTRL_C = "\x03";

const theme = {
  fg: (_c: string, t: string) => t,
  bold: (t: string) => t,
} as any;

test("studio state machine routes keys per mode (normal vs filter vs help)", () => {
  let state = createStudioState(DEFAULT_CONFIG);
  const t = (d: string) => reduceStudio(state, DEFAULT_CONFIG, d);

  // normal mode: `/` opens filter, not navigation
  const r1 = t("/");
  assert.equal(r1.state.mode, "filter");

  // filter mode: a letter extends the query instead of navigating
  const r2 = reduceStudio(r1.state, DEFAULT_CONFIG, "x");
  assert.equal(r2.state.mode, "filter");
  assert.equal(r2.state.filterQuery, "x");
});

test("filter mode: j navigates in normal but appends in filter", () => {
  const base = createStudioState(DEFAULT_CONFIG);
  assert.equal(base.state.selectedIndex, 0);

  // normal: j advances selection
  const a = reduceStudio(base, DEFAULT_CONFIG, "j");
  assert.equal(a.state.mode, "normal");
  assert.equal(a.state.selectedIndex, 1);

  // filter: j is a printable filter char
  const b = reduceStudio(a.state, DEFAULT_CONFIG, "/"); // enter filter
  assert.equal(b.state.mode, "filter");
  const c = reduceStudio(b.state, DEFAULT_CONFIG, "j");
  assert.equal(c.state.filterQuery, "j");
});

test("help mode only exits on q / escape / ?", () => {
  const base = createStudioState(DEFAULT_CONFIG);
  const help = reduceStudio(base, DEFAULT_CONFIG, "?");
  assert.equal(help.state.mode, "help");

  // a navigation key in help does nothing
  const noop = reduceStudio(help.state, DEFAULT_CONFIG, "j");
  assert.equal(noop.state.mode, "help");
  assert.equal(noop.sideEffects.length, 0);

  // q closes help
  assert.equal(reduceStudio(help.state, DEFAULT_CONFIG, "q").state.mode, "normal");
  assert.equal(reduceStudio(help.state, DEFAULT_CONFIG, ESC).state.mode, "normal");
  assert.equal(reduceStudio(help.state, DEFAULT_CONFIG, "?").state.mode, "normal");
});

test("focus cycling across panes wraps", () => {
  let state = createStudioState(DEFAULT_CONFIG);
  const panes = DEFAULT_CONFIG.panes;
  assert.deepEqual(state, { ...state, mode: "normal" });

  for (let i = 0; i < panes.length; i++) {
    assert.equal(state.focusPane, panes[i]);
    const r = reduceStudio(state, DEFAULT_CONFIG, TAB);
    state = r.state;
  }
  // after a full lap we wrap back to the first pane
  assert.equal(state.focusPane, panes[0]);
});

test("Tab is distinct from printable input in filter mode", () => {
  const f = reduceStudio(createStudioState(DEFAULT_CONFIG), DEFAULT_CONFIG, "/");
  assert.equal(f.state.mode, "filter");
  // Tab does NOT advance focus while filtering; it's a printable-less no-op
  const r = reduceStudio(f.state, DEFAULT_CONFIG, TAB);
  assert.equal(r.state.mode, "filter");
  assert.equal(r.state.focusPane, DEFAULT_CONFIG.panes[0]);
});

test("exit on q / escape / ctrl+c emits exit side effect", () => {
  for (const key of ["q", ESC, CTRL_C]) {
    const r = reduceStudio(createStudioState(DEFAULT_CONFIG), DEFAULT_CONFIG, key);
    assert.equal(r.sideEffects.length, 1);
    assert.equal(r.sideEffects[0]!.type, "exit");
  }
});

test("navigation clamps at list bounds", () => {
  const cfg = { ...DEFAULT_CONFIG, listLength: 3 };
  const top = reduceStudio(createStudioState(cfg), cfg, "k");
  assert.equal(top.state.selectedIndex, 0); // clamped, no wrap
  const full = reduceStudio(createStudioState(cfg), cfg, "j");
  assert.equal(full.state.selectedIndex, 1);
  const full2 = reduceStudio(
    reduceStudio(full.state, cfg, "j").state,
    cfg,
    "j",
  );
  assert.equal(full2.state.selectedIndex, 2);
  const over = reduceStudio(full2.state, cfg, "j");
  assert.equal(over.state.selectedIndex, 2); // clamped at last
});

test("filter typing, backspace, and ctrl+u", () => {
  const s0 = createStudioState(DEFAULT_CONFIG);
  let s = reduceStudio(s0, DEFAULT_CONFIG, "/").state; // enter filter
  s = reduceStudio(s, DEFAULT_CONFIG, "a").state;
  s = reduceStudio(s, DEFAULT_CONFIG, "b").state;
  s = reduceStudio(s, DEFAULT_CONFIG, "c").state;
  assert.equal(s.filterQuery, "abc");
  s = reduceStudio(s, DEFAULT_CONFIG, BACKSPACE).state;
  assert.equal(s.filterQuery, "ab");
  s = reduceStudio(s, DEFAULT_CONFIG, CTRL_U).state;
  assert.equal(s.filterQuery, "");
  // enter applies the filter and returns to normal, keeping the (empty) query
  s = reduceStudio(s, DEFAULT_CONFIG, "d").state;
  s = reduceStudio(s, DEFAULT_CONFIG, ENTER).state;
  assert.equal(s.mode, "normal");
  assert.equal(s.filterQuery, "d");
});

test("confirm mode routes enter (confirm) and escape/q (cancel)", () => {
  const seeded: StudioState = { ...createStudioState(DEFAULT_CONFIG), mode: "confirm" };
  const confirmed = reduceStudio(seeded, DEFAULT_CONFIG, ENTER);
  assert.equal(confirmed.state.mode, "normal");
  assert.equal(confirmed.sideEffects.length, 1);
  assert.equal(confirmed.sideEffects[0]!.type, "confirm");

  const cancelledEsc = reduceStudio(seeded, DEFAULT_CONFIG, ESC);
  assert.equal(cancelledEsc.state.mode, "normal");
  assert.equal(cancelledEsc.sideEffects[0]!.type, "cancelConfirm");

  const cancelledQ = reduceStudio(seeded, DEFAULT_CONFIG, "q");
  assert.equal(cancelledQ.state.mode, "normal");
  assert.equal(cancelledQ.sideEffects[0]!.type, "cancelConfirm");
});

test("component surfaces: focused, render, handleInput wiring", () => {
  let doneCalls = 0;
  const tui = { requestRender: () => {} } as any;
  const comp = createStudioComponent(
    /* ctx */ { mode: "tui", hasUI: true, ui: { notify: () => {} } } as any,
    tui,
    theme,
    () => {
      doneCalls++;
    },
    DEFAULT_CONFIG,
  );

  // Focusable contract: the studio takes full keyboard focus.
  assert.equal(comp.focused, true);

  // Initial render is the normal studio shell.
  const normalLines = comp.render(40)!;
  assert.ok(normalLines.join("\n").includes("SKILL STUDIO"));
  assert.ok(normalLines.join("\n").includes("MODE NORMAL"));

  // q exits -> done() invoked once.
  comp.handleInput("q");
  assert.equal(doneCalls, 1);

  // filter path: `/` then `x` reflects in render.
  const comp2 = createStudioComponent({} as any, tui, theme, () => {}, DEFAULT_CONFIG);
  comp2.handleInput("/");
  comp2.handleInput("x");
  const filterLines = comp2.render(40)!;
  assert.ok(filterLines.join("\n").includes("MODE FILTER"));
  assert.ok(filterLines.join("\n").includes('query: "x"'));

  // help path: `?` renders the help overlay.
  const comp3 = createStudioComponent({} as any, tui, theme, () => {}, DEFAULT_CONFIG);
  comp3.handleInput("?");
  const helpLines = comp3.render(40)!;
  assert.ok(helpLines.join("\n").includes("MODE HELP"));
  assert.ok(helpLines.join("\n").includes("navigate"));

  // focus cycle reflects the active pane.
  const comp4 = createStudioComponent({} as any, tui, theme, () => {}, DEFAULT_CONFIG);
  comp4.handleInput(TAB);
  const focusedLines = comp4.render(80)!;
  assert.ok(focusedLines.join("\n").includes("[detail]"));
});

test("openSkillStudio is a no-op with a notice in print/json/rpc modes", () => {
  for (const mode of ["print", "json", "rpc"] as const) {
    let notified = "";
    let customCalled = 0;
    const ctx = {
      mode,
      hasUI: false,
      ui: {
        notify: (m: string) => {
          notified = m;
        },
        custom: () => {
          customCalled++;
          return Promise.resolve(undefined);
        },
      },
    } as any;

    const result = openSkillStudio(ctx);
    assert.equal(result, undefined);
    assert.equal(customCalled, 0);
    assert.match(
      notified,
      /Skill Studio is only available in interactive \(TUI\) mode/,
    );
  }
});

test("openSkillStudio opens a fullscreen custom component in tui mode", async () => {
  let factory: any;
  let opts: any;
  const result = { value: "studio-result" };
  const ctx = {
    mode: "tui",
    hasUI: true,
    cwd: "/tmp/x",
    ui: {
      custom: (f: unknown, o: unknown) => {
        factory = f;
        opts = o;
        // resolve the done promise with a sentinel
        return new Promise((resolve) => {
          const done = (r: unknown) => resolve(r ?? result);
          (factory as any)(null, theme, null, done);
        });
      },
      notify: () => {},
    },
  } as any;

  // The studio must NOT open as the Deck's centered overlay.
  const p = openSkillStudio(ctx);
  assert.equal(opts, undefined);
  assert.equal(factory, createStudioComponent); // bound to a component factory

  // Drive the component: q exits and resolves the door with done().
  const comp = factory(null, theme, null, (r: unknown) => {
    p.resolve(r);
  });
  assert.equal(comp.focused, true);
  comp.handleInput("q");
});

test("studio modules are English-only operator surfaces", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const root = join(import.meta.dirname, "..");
  const read = (rel: string) =>
    readFileSync(join(root, rel), "utf8");

  const sources = [
    read("src/studio/types.ts"),
    read("src/studio/state.ts"),
    read("src/studio/component.ts"),
    read("src/studio/open.ts"),
  ].join("\n");

  // English operator copy present.
  assert.match(sources, /Skill Studio/);
  assert.match(sources, /navigate/);
  assert.match(sources, /quit/);
  // No Dutch UI copy leaked in.
  assert.doesNotMatch(sources, /geen skills voor/i);
  assert.doesNotMatch(sources, /opslaan/);
  assert.doesNotMatch(sources, /verwijderen/);
});
