/**
 * History navigation for `BashModeEditor`.
 *
 * These helpers operate on the editor instance through its public methods plus
 * `Reflect`-based access to fields that are private on the editor class. This
 * mirrors the existing `resetShellHistoryBrowse` convention in `editor-input.ts`
 * and keeps the main editor class under the module-size ceiling.
 */

/** Whether pressing ↑ in non-bash mode should recall the previous prompt. */
export function isPromptHistoryRecallPosition(editor: any): boolean {
  if (editor.isShowingAutocomplete()) return false;

  const history = Reflect.get(editor, "history");
  if (!Array.isArray(history) || history.length === 0) return false;

  const lines = editor.getLines();
  const cursor = editor.getCursor();
  if (lines.length === 1) {
    return cursor.line === 0 && cursor.col === (lines[0]?.length ?? 0);
  }

  const isOnFirstVisualLine = Reflect.get(editor, "isOnFirstVisualLine");
  if (
    typeof isOnFirstVisualLine === "function" &&
    !isOnFirstVisualLine.call(editor)
  ) {
    return false;
  }

  return cursor.line === 0;
}

/**
 * Step through the shell history list in bash mode. `direction` is -1 (older,
 * i.e. cursor-up) or +1 (newer, i.e. cursor-down). The first step snapshots the
 * current draft and loads matching history entries; returning past the newest
 * entry restores that draft.
 */
export function navigateShellHistory(
  editor: any,
  direction: -1 | 1,
): void {
  const optionsRef = Reflect.get(editor, "optionsRef");
  let index = Reflect.get(editor, "shellHistoryIndex") as number;
  let items = Reflect.get(editor, "shellHistoryItems") as string[];
  let draft = Reflect.get(editor, "shellHistoryDraft") as string;

  const prefix = draft || editor.getExpandedText();
  if (index === -1) {
    draft = prefix;
    items = optionsRef.getHistoryEntries(prefix);
  }

  if (items.length === 0) {
    Reflect.set(editor, "shellHistoryIndex", index);
    Reflect.set(editor, "shellHistoryItems", items);
    Reflect.set(editor, "shellHistoryDraft", draft);
    optionsRef.onNotify("No shell history matches", "info");
    return;
  }

  if (direction < 0) {
    index = Math.min(items.length - 1, index + 1);
  } else {
    index -= 1;
  }

  if (index < 0) {
    index = -1;
    editor.setText(draft);
    editor.scheduleGhostUpdate();
  } else {
    editor.setText(items[index] ?? draft);
    editor.clearGhostSuggestion();
  }

  Reflect.set(editor, "shellHistoryIndex", index);
  Reflect.set(editor, "shellHistoryItems", items);
  Reflect.set(editor, "shellHistoryDraft", draft);
}
