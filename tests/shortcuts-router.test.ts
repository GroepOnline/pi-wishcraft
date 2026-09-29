import assert from "node:assert/strict";
import test from "node:test";
import {
  getCurrentEditorText,
  getPowerlineShortcutAction,
  isPromptHistoryShortcutInput,
} from "../src/extension/shortcuts/shortcuts-router.ts";
import {
  parseBashModeSettings,
  resolveShortcutConfig,
} from "../src/extension/shortcuts/shortcuts-config.ts";

function makeRt(overrides: Record<string, unknown> = {}): any {
  const resolved = resolveShortcutConfig({});
  const bashModeSettings = parseBashModeSettings({}, resolved);
  return {
    resolvedShortcuts: resolved,
    bashModeSettings,
    currentEditor: null,
    ...overrides,
  };
}

/**
 * Kitty CSI-u press form the pi-tui matcher accepts. The modifier field is
 * 1 + bitmask (shift=1, alt=2, ctrl=4), parsed from the binding itself so
 * ctrl+alt+c (7) and ctrl+shift+b (6) both encode correctly.
 */
function kittyPress(shortcut: string): string {
  const parts = shortcut.toLowerCase().split("+");
  const key = parts.at(-1)!;
  let mask = 0;
  if (parts.includes("shift")) mask |= 1;
  if (parts.includes("alt")) mask |= 2;
  if (parts.includes("ctrl")) mask |= 4;
  return `\x1b[${key.charCodeAt(0)};${1 + mask}u`;
}

/** Kitty release form: the event flag ":3" marks a release. */
function kittyRelease(shortcut: string): string {
  const press = kittyPress(shortcut);
  return press.replace("u", ":3u");
}

test("router: every configured shortcut resolves to its action", () => {
  const rt = makeRt();
  const cases: Array<[string | null, string]> = [
    [rt.resolvedShortcuts.stashHistory, "stashHistory"],
    [rt.resolvedShortcuts.copyEditor, "copyEditor"],
    [rt.resolvedShortcuts.cutEditor, "cutEditor"],
    [rt.resolvedShortcuts.queueOpen, "queueOpen"],
    [rt.bashModeSettings.toggleShortcut, "bashMode"],
  ];
  for (const [shortcut, kind] of cases) {
    if (!shortcut) continue;
    const action = getPowerlineShortcutAction(rt, kittyPress(shortcut));
    assert.ok(action, `no action for ${shortcut}`);
    assert.equal(action.kind, kind, `shortcut ${shortcut}`);
  }
  // ideaCapture is null by default; an unbound key never fires.
  assert.equal(getPowerlineShortcutAction(rt, kittyPress("ctrl+alt+g")), null);
});

test("router: key release events never trigger actions", () => {
  const rt = makeRt();
  const release = kittyRelease(rt.resolvedShortcuts.copyEditor);
  assert.equal(
    getPowerlineShortcutAction(rt, release),
    null,
    "the same key as a release is filtered before matching",
  );
});

test("router: stash history binding and its kitty fallback resolve", () => {
  const rt = makeRt();
  if (rt.resolvedShortcuts.stashHistory !== "ctrl+alt+h") return; // env-specific
  assert.equal(isPromptHistoryShortcutInput(rt, "\x1b[104;7u"), true, "kitty form");
  assert.equal(isPromptHistoryShortcutInput(rt, "\x1b[27;7;104~"), true, "legacy form");
  assert.equal(isPromptHistoryShortcutInput(rt, "x"), false);
});

test("router: getCurrentEditorText prefers the live editor over ctx", () => {
  const ctx = { ui: { getEditorText: () => "from-ctx" } };
  assert.equal(getCurrentEditorText(ctx, { getExpandedText: () => "from-editor" }), "from-editor");
  assert.equal(getCurrentEditorText(ctx, null), "from-ctx");
  assert.equal(getCurrentEditorText(ctx, { getExpandedText: () => "" }), "from-ctx");
  // Missing ctx.ui must fall through to "" instead of throwing.
  assert.equal(getCurrentEditorText({}, null), "");
  assert.equal(getCurrentEditorText({ ui: {} }, null), "");
});
