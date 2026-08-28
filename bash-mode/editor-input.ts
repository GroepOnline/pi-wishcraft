import { fileURLToPath } from "node:url";

export interface EditorBoundaryShortcuts {
  start: string | null;
  end: string | null;
}

export const DEFAULT_EDITOR_BOUNDARY_SHORTCUTS: EditorBoundaryShortcuts = {
  start: "super+shift+up",
  end: "super+shift+down",
};

export function isPrintableInput(data: string): boolean {
  const points = [...data];
  if (points.length !== 1) return false;
  return (points[0]?.codePointAt(0) ?? 0) >= 32;
}

export function isCommandUndoShortcut(data: string): boolean {
  return (
    data === "\x1b[122;9u" ||
    data === "\x1b[122;9:1u" ||
    data === "\x1b[122;9:2u" ||
    data === "\x1b[27;9;122~"
  );
}

export function bracketedPasteContent(data: string): string | null {
  const startMarker = "\x1b[200~";
  const endMarker = "\x1b[201~";
  const start = data.indexOf(startMarker);
  if (start !== 0) return null;

  const end = data.indexOf(endMarker, startMarker.length);
  if (end === -1 || end + endMarker.length !== data.length) return null;

  return data.slice(startMarker.length, end);
}

export function decodeFileUriList(text: string): string | null {
  const entries = text
    .split(/\r?\n|\s+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && !entry.startsWith("#"));

  if (
    entries.length === 0 ||
    entries.some((entry) => !entry.startsWith("file://"))
  ) {
    return null;
  }

  try {
    return entries.map((entry) => fileURLToPath(entry)).join(" ");
  } catch {
    return null;
  }
}

export function droppedPathTextFromInput(data: string): string | null {
  const pasteContent = bracketedPasteContent(data);
  const text = pasteContent ?? data;
  const uriList = decodeFileUriList(text);
  if (uriList) return uriList;

  const trimmed = text.replace(/^[\r\n]+|[\r\n]+$/g, "");
  if (trimmed.length <= 1 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(trimmed)) {
    return null;
  }

  if (/^(?:\/|~\/|\.\.?\/)/.test(trimmed) && !/[\r\n]/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

export function resetShellHistoryBrowse(state: object): void {
  Reflect.set(state, "shellHistoryIndex", -1);
  Reflect.set(state, "shellHistoryItems", []);
  Reflect.set(state, "shellHistoryDraft", "");
}

/**
 * Move the editor cursor to the first or last visual line/column. Reads and
 * writes the editor's internal cursor state through `Reflect` so the helper can
 * live outside the editor class without widening its private surface.
 */
export function moveCursorToEditorBoundary(
  editor: any,
  position: "start" | "end",
): void {
  const state = Reflect.get(editor, "state");
  const lines =
    state && typeof state === "object" ? Reflect.get(state, "lines") : null;
  if (!Array.isArray(lines)) {
    throw new Error("Editor cursor state is unavailable");
  }

  if (position === "start") {
    Reflect.set(state, "cursorLine", 0);
    Reflect.set(state, "cursorCol", 0);
  } else {
    const lastLine = Math.max(0, lines.length - 1);
    Reflect.set(state, "cursorLine", lastLine);
    Reflect.set(
      state,
      "cursorCol",
      typeof lines[lastLine] === "string" ? lines[lastLine].length : 0,
    );
  }

  Reflect.set(editor, "lastAction", null);
  Reflect.set(editor, "preferredVisualCol", null);
  Reflect.set(editor, "snappedFromCursorCol", null);
  editor.tui.requestRender();
}
