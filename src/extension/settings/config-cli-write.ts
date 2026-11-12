/**
 * config-cli-write.ts — `set|unset` lane: coercion + apply + error UX.
 * ------------------------------------------------------------------------
 * Split from config-cli.ts — pure lanes; the facade re-exports the public
 * surface so the single consumer (wishcraft-config.ts) is unchanged.
 * ---------------------------------------------------------------------------
 */

import { editDistanceWithin } from "../../tools/text.ts";
import {
  SETTINGS_REGISTRY,
  effectiveSettingValue,
  getSettingDefinition,
  settingLabel,
  validationProblem,
  type SettingDefinition,
  type SettingValue,
} from "../../config/settings-registry.ts";import { tr } from "../../i18n/index.ts";import {
  coerceConfigValue,
  displayValue,
  readConfigPath,
  writeConfigPath,
} from "./config-paths.ts";import {
  readSettings,
  } from "./settings-io.ts";
// ---------------------------------------------------------------------------
// Mutation (pure apart from the settings write)
// ---------------------------------------------------------------------------

/** Accept the words operators actually type for a toggle. */
export function parseToggleWord(raw: string): boolean | null {
  const value = raw.trim().toLowerCase();
  if (["on", "true", "1", "yes"].includes(value)) return true;
  if (["off", "false", "0", "no"].includes(value)) return false;
  return null;
}

/** Unique case-insensitive prefix match across a select's choices. */
function resolveChoice(
  definition: SettingDefinition,
  raw: string,
): string | null {
  if (definition.kind !== "select") return null;
  const needle = raw.trim().toLowerCase();
  if (definition.choices.includes(needle)) {
    // Preserve the canonical casing from the choices list.
    return definition.choices.find((choice) => choice === needle) ?? needle;
  }
  const matches = definition.choices.filter((choice) =>
    choice.toLowerCase().startsWith(needle),
  );
  return matches.length === 1 ? matches[0]! : null;
}

export type ConfigSetResult =
  | {
      ok: true;
      path: string;
      label: string;
      value: SettingValue | null;
      display: string;
      restartRequired: boolean;
    }
  | { ok: false; message: string };

/**
 * Validate and write one setting.
 *
 * `value === null` is never written — use `unset`. An empty value on a text
 * setting removes the key so the default applies again.
 */
export function applyConfigSet(
  cwd: string,
  pathOrId: string,
  rawValue: string,
): ConfigSetResult {
  const definition = getSettingDefinition(pathOrId);
  if (!definition) {
    const suggestion = suggestSettingPath(pathOrId);
    return {
      ok: false,
      message: suggestion
        ? `${tr("cli.unknownSetting", 'Unknown setting "{path}".', { path: pathOrId })} ${tr(
            "cli.didYouMean",
            "Did you mean {path}?",
            { path: suggestion },
          )}`
        : `${tr("cli.unknownSetting", 'Unknown setting "{path}".', { path: pathOrId })} ${tr(
            "cli.structuredHint",
            "Structured values (layout, segments, policy…) are edited in settings.json.",
          )}`,
    };
  }

  const settings = readSettings(cwd);
  const current = readConfigPath(settings, definition.path);

  // Toggles speak on/off at the prompt, not "true"/"false" strings.
  if (definition.kind === "toggle") {
    const parsed = parseToggleWord(rawValue);
    if (parsed === null) {
      return {
        ok: false,
        message: tr(
          "cli.toggleUsage",
          '"{label}" is a toggle — type: on or off.',
          { label: settingLabel(definition) },
        ),
      };
    }
    const ok = writeConfigPath(cwd, definition.path, parsed);
    if (!ok) return { ok: false, message: writeFailure(definition.path) };
    return {
      ok: true,
      path: definition.path,
      label: settingLabel(definition),
      value: parsed,
      display: parsed ? tr("config.on", "on") : tr("config.off", "off"),
      restartRequired: definition.restartRequired === true,
    };
  }

  // A select accepts a unique prefix: `set motion.level red` → reduced.
  if (definition.kind === "select") {
    const choice = resolveChoice(definition, rawValue);
    if (choice === null) {
      return {
        ok: false,
        message: validationProblem(
          definition,
          rawValue.trim(),
          effectiveSettingValue(definition, current),
        ) ?? "",
      };
    }
    const ok = writeConfigPath(cwd, definition.path, choice);
    if (!ok) return { ok: false, message: writeFailure(definition.path) };
    return {
      ok: true,
      path: definition.path,
      label: settingLabel(definition),
      value: choice,
      display: choice,
      restartRequired: definition.restartRequired === true,
    };
  }

  // Number and text share the overlay's coercion, so the CLI and the TUI
  // accept exactly the same input.
  const coerced = coerceConfigValue(definition, current, rawValue);
  if (!coerced.ok) return { ok: false, message: coerced.reason };

  // Empty text = remove the key so the default applies again.
  const value = coerced.value === "" ? null : coerced.value;
  const ok = writeConfigPath(cwd, definition.path, value);
  if (!ok) return { ok: false, message: writeFailure(definition.path) };
  return {
    ok: true,
    path: definition.path,
    label: settingLabel(definition),
    value,
    display:
      value === null
        ? tr("cli.cleared", "cleared (default applies)")
        : displayValue(definition, value),
    restartRequired: definition.restartRequired === true,
  };
}

export type ConfigUnsetResult =
  | { ok: true; path: string; label: string; effective: string }
  | { ok: false; message: string };

/** Remove the stored key; the effective value falls back to the default. */
export function applyConfigUnset(
  cwd: string,
  pathOrId: string,
): ConfigUnsetResult {
  const definition = getSettingDefinition(pathOrId);
  if (!definition) {
    return { ok: false, message: unknownSettingMessage(pathOrId) };
  }
  const ok = writeConfigPath(cwd, definition.path, null);
  if (!ok) return { ok: false, message: writeFailure(definition.path) };
  const settings = readSettings(cwd);
  const fallback = effectiveSettingValue(
    definition,
    readConfigPath(settings, definition.path),
  );
  return {
    ok: true,
    path: definition.path,
    label: settingLabel(definition),
    effective: fallback === null ? "—" : String(fallback),
  };
}

function writeFailure(path: string): string {
  return tr(
    "cli.notSaved",
    "Could not write {path} — settings.json not writable?",
    { path },
  );
}

function unknownSettingMessage(pathOrId: string): string {
  const suggestion = suggestSettingPath(pathOrId);
  return suggestion
    ? `${tr("cli.unknownSetting", 'Unknown setting "{path}".', { path: pathOrId })} ${tr(
        "cli.didYouMean",
        "Did you mean {path}?",
        { path: suggestion },
      )}`
    : unknownSettingWithoutSuggestion(pathOrId);
}

function unknownSettingWithoutSuggestion(pathOrId: string): string {
  return `${tr("cli.unknownSetting", 'Unknown setting "{path}".', { path: pathOrId })} ${tr(
    "cli.structuredHint",
    "Structured values (layout, segments, policy…) are edited in settings.json.",
  )}`;
}

/** "did you mean" over registered paths *and* ids — operators type both. */
export function suggestSettingPath(input: string): string | null {
  const needle = input.toLowerCase();
  const entries = SETTINGS_REGISTRY.map((definition) => ({
    path: definition.path,
    id: definition.id.toLowerCase(),
    lowerPath: definition.path.toLowerCase(),
  }));

  const byPrefix = entries.filter(
    (entry) =>
      entry.lowerPath.startsWith(needle) || entry.id.startsWith(needle),
  );
  if (byPrefix.length === 1) return byPrefix[0]!.path;

  const byContains = entries.filter(
    (entry) => entry.lowerPath.includes(needle) || entry.id.includes(needle),
  );
  if (byContains.length === 1) return byContains[0]!.path;

  // Edit distance runs against the id (`motion.leval` → `motion.level`)
  // and the full path (`powerline.presot` → `powerline.preset`); ids are
  // short enough that a distance of 2 stays a real typo, not a guess.
  const near = entries.filter(
    (entry) =>
      editDistanceWithin(needle, entry.id, 2) ||
      editDistanceWithin(needle, entry.lowerPath, 2),
  );
  return near.length === 1 ? near[0]!.path : null;
}

/** Levenshtein distance, bailed out early once it exceeds `max`. */

