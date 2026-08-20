import type { BashModeSettings } from "../../../bash-mode/types.ts";
import type { PowerlineShortcutKey, PowerlineShortcuts } from "./types.ts";

export const CUSTOM_COMPACTION_STATUS_KEY = "compact-policy";

export const STASH_HISTORY_LIMIT = 12;
export const PROJECT_PROMPT_HISTORY_LIMIT = 50;
export const STASH_PREVIEW_WIDTH = 72;

export const DEFAULT_SHORTCUTS: PowerlineShortcuts = {
  stashHistory: "ctrl+alt+h",
  copyEditor: "ctrl+alt+c",
  cutEditor: "ctrl+alt+x",
  ideaCapture: null,
  queueOpen: "ctrl+alt+q",
  editorStart: "super+shift+up",
  editorEnd: "super+shift+down",
  menu: "alt+p",
  info: "alt+i",
};
export const DEFAULT_BASH_MODE_SETTINGS = {
  toggleShortcut: "ctrl+shift+b",
  transcriptMaxLines: 2000,
  transcriptMaxBytes: 512 * 1024,
  initScript: null,
} as const satisfies BashModeSettings;
export const SHORTCUT_KEYS: PowerlineShortcutKey[] = [
  "stashHistory",
  "copyEditor",
  "cutEditor",
  "ideaCapture",
  "queueOpen",
  "editorStart",
  "editorEnd",
  "menu",
  "info",
];

export const PROMPT_HISTORY_LIMIT = 100;
export const LAYOUT_CACHE_TTL_MS = 250;
export const STREAMING_LAYOUT_CACHE_TTL_MS = 1000;
export const STATUS_RENDER_DEBOUNCE_MS = 33;
export const CONTEXT_STATUS_RENDER_MS = 250;
export const EDITOR_STATUS_DEFER_MS = 150;
