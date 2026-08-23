import assert from "node:assert/strict";
import { test } from "node:test";
import { applyDeckInput } from "../src/extension/ui/deck/input.ts";
import { createDeckNavState } from "../src/extension/ui/deck/component.ts";

test("g-jumps switch routes without a TUI", () => {
  let state = createDeckNavState("home");
  let result = applyDeckInput(state, "g");
  result = applyDeckInput(result.state, "s");
  assert.equal(result.state.route, "signal");
  result = applyDeckInput(result.state, "g");
  result = applyDeckInput(result.state, "i");
  assert.equal(result.state.route, "ideas");
});

test("slash palette jumps to an exact route on enter", () => {
  let state = createDeckNavState("home");
  let result = applyDeckInput(state, "/");
  assert.equal(result.state.searchOpen, true);
  for (const ch of "skills") result = applyDeckInput(result.state, ch);
  result = applyDeckInput(result.state, "enter");
  assert.equal(result.state.route, "skills");
  assert.equal(result.state.searchOpen, false);
});

test("escape closes search, then the deck", () => {
  let result = applyDeckInput(createDeckNavState("home"), "/");
  result = applyDeckInput(result.state, "escape");
  assert.equal(result.state.searchOpen, false);
  assert.equal(result.action.type, "none");
  result = applyDeckInput(result.state, "escape");
  assert.equal(result.action.type, "close");
});

test("n on the skills route opens the inline wizard", () => {
  const result = applyDeckInput(createDeckNavState("skills"), "n");
  assert.equal(result.state.skills?.wizardOpen, true);
  assert.equal(result.state.skills?.wizard?.step, "name");
});

test("appearance enter applies a structural base", () => {
  const result = applyDeckInput(createDeckNavState("appearance"), "enter");
  assert.equal(result.action.type, "appearance");
  if (result.action.type === "appearance") {
    assert.equal(result.action.mix.base, "lanternwake");
  }
});
