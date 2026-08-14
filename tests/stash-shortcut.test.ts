import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matchesStashShortcutInput } from "../src/shortcuts/matching.ts";

const editorSource = readFileSync(
  new URL("../src/extension/ui/custom-editor.ts", import.meta.url),
  "utf-8",
);
const routerSource = readFileSync(
  new URL("../src/extension/shortcuts/shortcuts-router.ts", import.meta.url),
  "utf-8",
);

test("stash shortcut matches Alt+S encodings without consuming literal sharp-S by default", () => {
  assert.equal(matchesStashShortcutInput("ß"), false);
  assert.equal(
    matchesStashShortcutInput("ß", { includePrintableSharpS: true }),
    true,
  );

  for (const data of [
    "\x1bs",
    "\x1bS",
    "\x1b[115;3u",
    "\x1b[83;3u",
    "\x1b[27;3;115~",
    "\x1b[27;3;83~",
  ]) {
    assert.equal(matchesStashShortcutInput(data), true, data);
  }

  assert.equal(matchesStashShortcutInput("s"), false);
  assert.equal(matchesStashShortcutInput("\x1b[115;5u"), false);
});

test("stash shortcut stays in terminal/editor fallback routing", () => {
  assert.doesNotMatch(editorSource, /pi\.registerShortcut\("alt\+s"/);
  assert.match(
    routerSource,
    /matchesStashShortcutInput\(data, \{\s*includePrintableSharpS: config\.stashSharpSShortcut,?\s*\}\)/,
  );
  assert.match(editorSource, /ctx\.ui\.onTerminalInput\(\(data: string\) =>/);
  assert.match(editorSource, /if \(isStashShortcutInput\(data\)\)/);
  assert.match(
    routerSource,
    /export function stashOrRestoreEditorText\(rt: RuntimeState, ctx: any\): void/,
  );
  assert.match(routerSource, /export function isPromptHistoryShortcutInput\(/);
  assert.match(
    routerSource,
    /matchesConfiguredShortcut\(data, rt\.resolvedShortcuts\.stashHistory\)/,
  );
  assert.doesNotMatch(editorSource, /data === "\\x1b\\b"/);
  assert.doesNotMatch(editorSource, /data === "\\x1b\\x7f"/);
});
