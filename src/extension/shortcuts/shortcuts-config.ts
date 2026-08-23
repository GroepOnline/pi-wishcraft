import { TUI_KEYBINDINGS } from "@earendil-works/pi-tui";

import type { BashModeSettings } from "../../../bash-mode/types.ts";
import {
  isSupportedSuperShortcut,
  shortcutConflictKey,
  shortcutUsesSuper,
} from "../../shortcuts/matching.ts";
import { isRecord } from "../settings/settings-io.ts";
import {
  DEFAULT_BASH_MODE_SETTINGS,
  DEFAULT_SHORTCUTS,
  SHORTCUT_KEYS,
} from "../core/constants.ts";
import type {
  PowerlineShortcutKey,
  PowerlineShortcuts,
  ShortcutBinding,
} from "../core/types.ts";

const APP_RESERVED_SHORTCUTS = [
  "escape",
  "ctrl+c",
  "ctrl+d",
  "ctrl+z",
  "shift+tab",
  "ctrl+p",
  "shift+ctrl+p",
  "ctrl+l",
  "ctrl+o",
  "shift+ctrl+o",
  "ctrl+t",
  "ctrl+n",
  "ctrl+g",
  "alt+enter",
  "alt+up",
  "alt+down",
  "ctrl+v",
  "alt+v",
  "shift+l",
  "shift+t",
  "ctrl+s",
  "ctrl+r",
  "ctrl+backspace",
  "ctrl+a",
  "ctrl+x",
  "ctrl+u",
] as const;
const EXTRA_RESERVED_SHORTCUTS = ["alt+s"] as const;
const SHORTCUT_MODIFIER_ORDER = ["ctrl", "alt", "super", "shift"] as const;
const SHORTCUT_MODIFIERS = new Set<string>(SHORTCUT_MODIFIER_ORDER);
const SHORTCUT_NAMED_KEYS = new Set([
  "escape",
  "esc",
  "enter",
  "return",
  "tab",
  "space",
  "backspace",
  "delete",
  "insert",
  "clear",
  "home",
  "end",
  "pageup",
  "pagedown",
  "up",
  "down",
  "left",
  "right",
]);
const SHORTCUT_SYMBOL_KEYS = new Set([
  "`",
  "-",
  "=",
  "[",
  "]",
  "\\",
  ";",
  "'",
  ",",
  ".",
  "/",
  "!",
  "@",
  "#",
  "$",
  "%",
  "^",
  "&",
  "*",
  "(",
  ")",
  "_",
  "|",
  "~",
  "{",
  "}",
  ":",
  "<",
  ">",
  "?",
]);

export function normalizeShortcut(value: string): string {
  const parts = value.trim().toLowerCase().split("+");
  if (parts.length <= 1) return parts[0] ?? "";

  const modifierRank = new Map<string, number>(
    SHORTCUT_MODIFIER_ORDER.map((modifier, index) => [modifier, index]),
  );
  const modifiers = parts
    .slice(0, -1)
    .sort((a, b) => (modifierRank.get(a) ?? 99) - (modifierRank.get(b) ?? 99));
  return [...modifiers, parts[parts.length - 1]].join("+");
}

export function reservedShortcuts(): Set<string> {
  const shortcuts = new Set<string>(
    [...EXTRA_RESERVED_SHORTCUTS, ...APP_RESERVED_SHORTCUTS].map(
      normalizeShortcut,
    ),
  );

  for (const definition of Object.values(TUI_KEYBINDINGS)) {
    const defaultKeys = definition.defaultKeys;
    const keys =
      defaultKeys === undefined
        ? []
        : Array.isArray(defaultKeys)
          ? defaultKeys
          : [defaultKeys];
    for (const key of keys) {
      shortcuts.add(normalizeShortcut(key));
    }
  }

  return shortcuts;
}

export function isValidShortcutKeyPart(keyPart: string): boolean {
  const lowerKeyPart = keyPart.toLowerCase();

  if (/^[a-z0-9]$/i.test(keyPart)) return true;
  if (/^f([1-9]|1[0-2])$/i.test(keyPart)) return true;
  if (SHORTCUT_NAMED_KEYS.has(lowerKeyPart)) return true;

  return SHORTCUT_SYMBOL_KEYS.has(keyPart);
}

export function parseShortcutOverride(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) {
    return null;
  }

  const parts = trimmed.split("+");
  if (parts.some((part) => part.length === 0)) {
    return null;
  }

  const modifierParts = parts.slice(0, -1).map((part) => {
    const modifier = part.toLowerCase();
    return modifier === "cmd" || modifier === "command" ? "super" : modifier;
  });
  if (new Set(modifierParts).size !== modifierParts.length) {
    return null;
  }

  for (const modifier of modifierParts) {
    if (!SHORTCUT_MODIFIERS.has(modifier)) {
      return null;
    }
  }

  const keyPart = parts[parts.length - 1];
  if (!isValidShortcutKeyPart(keyPart)) {
    return null;
  }

  const normalizedKey = SHORTCUT_SYMBOL_KEYS.has(keyPart)
    ? keyPart
    : keyPart.toLowerCase();
  const normalizedShortcut = normalizeShortcut(
    [...modifierParts, normalizedKey].join("+"),
  );
  if (
    shortcutUsesSuper(normalizedShortcut) &&
    !isSupportedSuperShortcut(normalizedShortcut)
  ) {
    return null;
  }

  return normalizedShortcut;
}

export function shortcutUsageKey(shortcut: string): string {
  return shortcutConflictKey(normalizeShortcut(shortcut));
}

export function parseShortcutSetting(
  value: unknown,
): ShortcutBinding | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  return parseShortcutOverride(value) ?? undefined;
}

export function findShortcutReplacement(
  key: PowerlineShortcutKey,
  used: Set<string>,
): string | null {
  const preferred = DEFAULT_SHORTCUTS[key];
  if (preferred && !used.has(shortcutUsageKey(preferred))) {
    return preferred;
  }

  for (const shortcutKey of SHORTCUT_KEYS) {
    const candidate = DEFAULT_SHORTCUTS[shortcutKey];
    if (candidate && !used.has(shortcutUsageKey(candidate))) {
      return candidate;
    }
  }

  return null;
}

export function bashToggleShortcutReservation(
  settings: Record<string, unknown>,
): ShortcutBinding {
  const raw = isRecord(settings.bashMode) ? settings.bashMode : {};
  if (!Object.prototype.hasOwnProperty.call(raw, "toggleShortcut")) {
    return DEFAULT_BASH_MODE_SETTINGS.toggleShortcut;
  }

  const parsed = parseShortcutSetting(raw.toggleShortcut);
  return parsed === undefined
    ? DEFAULT_BASH_MODE_SETTINGS.toggleShortcut
    : parsed;
}

export function resolveShortcutConfig(
  settings: Record<string, unknown>,
): PowerlineShortcuts {
  const resolved: PowerlineShortcuts = { ...DEFAULT_SHORTCUTS };
  const shortcutSettings = settings.powerlineShortcuts;

  if (isRecord(shortcutSettings)) {
    for (const key of SHORTCUT_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(shortcutSettings, key)) {
        continue;
      }

      const override = parseShortcutSetting(shortcutSettings[key]);
      if (override !== undefined) {
        resolved[key] = override;
      }
    }
  }

  const used = new Set(Array.from(reservedShortcuts(), shortcutUsageKey));
  const reservedBashToggle = bashToggleShortcutReservation(settings);
  if (reservedBashToggle) {
    used.add(shortcutUsageKey(reservedBashToggle));
  }

  for (const key of SHORTCUT_KEYS) {
    const configured = resolved[key];
    if (configured === null) {
      continue;
    }

    const configuredUsageKey = shortcutUsageKey(configured);

    if (!used.has(configuredUsageKey)) {
      used.add(configuredUsageKey);
      continue;
    }

    const replacement = findShortcutReplacement(key, used);
    if (!replacement) {
      console.debug(
        `[wishcraft] Shortcut conflict for ${key}: "${configured}" is already in use`,
      );
      continue;
    }

    console.debug(
      `[wishcraft] Shortcut conflict for ${key}: "${configured}" replaced with "${replacement}"`,
    );

    resolved[key] = replacement;
    used.add(shortcutUsageKey(replacement));
  }

  return resolved;
}

export function parseBashModeSettings(
  settings: Record<string, unknown>,
  powerlineShortcuts?: PowerlineShortcuts,
): BashModeSettings {
  const raw = isRecord(settings.bashMode) ? settings.bashMode : {};
  const used = new Set(Array.from(reservedShortcuts(), shortcutUsageKey));
  if (powerlineShortcuts) {
    for (const shortcut of Object.values(powerlineShortcuts)) {
      if (shortcut) {
        used.add(shortcutUsageKey(shortcut));
      }
    }
  }

  const configuredToggleShortcut = Object.prototype.hasOwnProperty.call(
    raw,
    "toggleShortcut",
  )
    ? parseShortcutSetting(raw.toggleShortcut)
    : undefined;
  const fallbackToggleShortcut = used.has(
    shortcutUsageKey(DEFAULT_BASH_MODE_SETTINGS.toggleShortcut),
  )
    ? null
    : DEFAULT_BASH_MODE_SETTINGS.toggleShortcut;
  const toggleShortcut =
    configuredToggleShortcut === null
      ? null
      : configuredToggleShortcut &&
          !used.has(shortcutUsageKey(configuredToggleShortcut))
        ? configuredToggleShortcut
        : fallbackToggleShortcut;

  if (configuredToggleShortcut && toggleShortcut !== configuredToggleShortcut) {
    console.debug(
      `[wishcraft] Bash mode shortcut conflict: "${configuredToggleShortcut}" replaced with "${toggleShortcut ?? "disabled"}"`,
    );
  }
  const transcriptMaxLines =
    typeof raw.transcriptMaxLines === "number" &&
    Number.isFinite(raw.transcriptMaxLines)
      ? Math.max(100, Math.floor(raw.transcriptMaxLines))
      : DEFAULT_BASH_MODE_SETTINGS.transcriptMaxLines;
  const transcriptMaxBytes =
    typeof raw.transcriptMaxBytes === "number" &&
    Number.isFinite(raw.transcriptMaxBytes)
      ? Math.max(16 * 1024, Math.floor(raw.transcriptMaxBytes))
      : DEFAULT_BASH_MODE_SETTINGS.transcriptMaxBytes;
  const initScript =
    typeof raw.initScript === "string" && raw.initScript.trim()
      ? raw.initScript
      : null;

  return {
    toggleShortcut,
    transcriptMaxLines,
    transcriptMaxBytes,
    initScript,
  };
}
