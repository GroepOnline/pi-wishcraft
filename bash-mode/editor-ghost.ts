import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

import type { GhostSuggestion } from "./types.ts";

/**
 * Overlay the ghost suggestion suffix on the editor's prompt line. Returns a
 * copy of the rendered lines with the ghost applied, or null when the ghost
 * cannot be shown (multi-line input, cursor not at end, already-typed text
 * mismatch, or a terminal too narrow). Callers fall back to the original
 * lines when this returns null.
 */
export function overlayGhostSuggestion(
  lines: string[],
  width: number,
  text: string,
  ghost: GhostSuggestion,
  cursor: { line: number; col: number },
): string[] | null {
  if (text.includes("\n")) return null;
  if (cursor.line !== 0 || cursor.col !== text.length) return null;
  if (!ghost.value.startsWith(text) || ghost.value === text) return null;
  if (lines.length < 3) return null;

  const suffix = ghost.value.slice(text.length);
  const contentLine = 1;
  const cursorBlock = "\x1b[7m \x1b[0m";
  const availableWidth = Math.max(0, width - visibleWidth(text) - 1);
  if (availableWidth === 0) return null;

  const shownSuffix = truncateToWidth(suffix, availableWidth, "", true);
  if (!shownSuffix) return null;

  const padding = " ".repeat(
    Math.max(0, width - visibleWidth(text) - 1 - visibleWidth(shownSuffix)),
  );
  const ghostText = `\x1b[38;5;244m${shownSuffix}\x1b[0m`;
  const next = [...lines];
  next[contentLine] = `${text}${cursorBlock}${ghostText}${padding}`;
  return next;
}

/**
 * Insert the full ghost suggestion when the cursor sits at the end of a
 * single-line buffer that is a strict prefix of the ghost.
 */
export function acceptGhostSuggestion(editor: any): boolean {
  const ghost = Reflect.get(editor, "ghost") as GhostSuggestion | null;
  if (!ghost) return false;

  const text = editor.getExpandedText();
  if (text.includes("\n")) return false;

  const cursor = editor.getCursor();
  if (cursor.line !== 0 || cursor.col !== text.length) return false;

  if (!ghost.value.startsWith(text) || ghost.value === text) return false;
  editor.setText(ghost.value);
  editor.clearGhostSuggestion();
  return true;
}

/**
 * Advance the buffer by one whitespace-delimited chunk toward the ghost.
 */
export function completeGhostSuggestionOneToken(editor: any): boolean {
  const ghost = Reflect.get(editor, "ghost") as GhostSuggestion | null;
  if (!ghost) return false;

  const text = editor.getExpandedText();
  if (text.includes("\n")) return false;

  const cursor = editor.getCursor();
  if (cursor.line !== 0 || cursor.col !== text.length) return false;

  const value = ghost.value;
  if (!value.startsWith(text) || value === text) return false;

  const rest = value.slice(text.length);
  const nextChunk = rest.match(/^\s*\S*/)?.[0];
  if (!nextChunk) return false;

  const next = text + nextChunk;
  editor.setText(next);

  if (value === next) {
    editor.clearGhostSuggestion();
  } else if (value.startsWith(next)) {
    editor.scheduleGhostUpdate();
  } else {
    editor.clearGhostSuggestion();
  }
  return true;
}
