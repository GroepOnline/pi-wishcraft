/**
 * config-cli.ts
 * ---------------------------------------------------------------------------
 * `/wishcraft get|set|unset` — configuration from the pi prompt, without an
 * editor and without opening a single overlay.
 *
 * The registry (`src/config/settings-registry.ts`) is the source of truth:
 * paths, kinds, choices, bounds and operator copy all come from there, so the
 * CLI, the flat settings TUI, the setup wizard and the diagnostics view can
 * never disagree about what a setting accepts.
 *
 * Design rules:
 *   • every failure states *why* and what to type instead (validationProblem),
 *   • `set` on a structured path (layout, segments, policy…) is refused with
 *     a pointer to settings.json — CLI values are scalars by design,
 *   • the runner is the only place with side effects; everything above it is
 *     pure and unit-testable.
 * ---------------------------------------------------------------------------
 */

import type { AutocompleteItem } from "@earendil-works/pi-tui";

import {
  SETTINGS_REGISTRY,
  effectiveSettingValue,
  getSettingDefinition,
  settingHint,
  settingLabel,
  validationProblem,
  type SettingDefinition,
  type SettingValue,
} from "../../config/settings-registry.ts";
import { tr, syncLocaleFromSettings } from "../../i18n/index.ts";
import type { RuntimeState } from "../core/types.ts";
import {
  coerceConfigValue,
  displayValue,
  readConfigPath,
  writeConfigPath,
} from "./config-paths.ts";
import { invalidateConfigDiagnosticsCache } from "./config-diagnostics.ts";
import {
  getProjectSettingsPath,
  getSettingsPath,
  readSettings,
  readSettingsFile,
} from "./settings-io.ts";
import { reloadPowerlineFromSettings } from "./appearance-write.ts";

// ---------------------------------------------------------------------------
// Grammar (pure)
// ---------------------------------------------------------------------------

export type ConfigCliVerb = "help" | "get" | "set" | "unset";

export type ConfigCliArgs =
  | { verb: "help" }
  | { verb: "get"; path: string }
  | { verb: "set"; path: string; value: string }
  | { verb: "unset"; path: string };

const VERB_ALIASES: Record<string, ConfigCliVerb> = {
  help: "help",
  "?": "help",
  get: "get",
  show: "get",
  set: "set",
  write: "set",
  unset: "unset",
  reset: "unset",
  clear: "unset",
};

/**
 * Recognise a config invocation. Returns `null` for anything that is not a
 * config verb so the caller can fall through to Deck routes (`ports`,
 * `motion`, …) and the settings/setup/doctor overlays.
 */
export function parseConfigCliArgs(args: string): ConfigCliArgs | null {
  const parts = args.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const verb = VERB_ALIASES[parts[0]!.toLowerCase()];
  if (!verb) return null;
  if (verb === "help") return { verb: "help" };
  const path = parts[1] ?? "";
  if (!path) return { verb, path: "" } as ConfigCliArgs;
  if (verb === "set") {
    // The value is everything after `<path>` — text settings may contain spaces.
    return { verb, path, value: parts.slice(2).join(" ") };
  }
  return { verb, path };
}

// ---------------------------------------------------------------------------
// Inspection (pure)
// ---------------------------------------------------------------------------

export type SettingSource = "global" | "project" | "default";

export interface ConfigValueInfo {
  /** False when the path/id is not in the registry (structured or unknown). */
  known: boolean;
  path: string;
  label: string;
  source: SettingSource;
  stored: unknown;
  effective: SettingValue | null;
  problem: string | null;
  hint: string | undefined;
}

function hasPath(settings: Record<string, unknown>, path: string): boolean {
  let cursor: unknown = settings;
  for (const part of path.split(".")) {
    if (typeof cursor !== "object" || cursor === null || Array.isArray(cursor)) {
      return false;
    }
    if (!(part in (cursor as Record<string, unknown>))) return false;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return true;
}

function rawPath(settings: Record<string, unknown>, path: string): unknown {
  let cursor: unknown = settings;
  for (const part of path.split(".")) {
    if (typeof cursor !== "object" || cursor === null || Array.isArray(cursor)) {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
}

/**
 * Where a scalar setting currently stands: which file owns it, what is
 * stored, what actually applies, and whether the stored value is usable.
 * Structured paths report `known: false` with their raw JSON preserved.
 */
export function inspectSetting(
  globalSettings: Record<string, unknown>,
  projectSettings: Record<string, unknown>,
  pathOrId: string,
): ConfigValueInfo {
  const definition = getSettingDefinition(pathOrId);
  const path = definition?.path ?? pathOrId;

  let source: SettingSource = "default";
  let stored: unknown = null;
  if (hasPath(projectSettings, path)) {
    source = "project";
    stored = rawPath(projectSettings, path);
  } else if (hasPath(globalSettings, path)) {
    source = "global";
    stored = rawPath(globalSettings, path);
  }

  if (!definition) {
    return {
      known: false,
      path,
      label: path,
      source,
      stored,
      effective: null,
      problem: null,
      hint: undefined,
    };
  }

  return {
    known: true,
    path,
    label: settingLabel(definition),
    source,
    stored,
    effective: effectiveSettingValue(definition, stored),
    problem:
      source === "default" ? null : validationProblem(definition, stored, effectiveSettingValue(definition, stored)),
    hint: settingHint(definition),
  };
}

function sourceWord(source: SettingSource): string {
  return source === "project"
    ? tr("cli.source.project", "project settings")
    : source === "global"
      ? tr("cli.source.global", "global settings")
      : tr("cli.source.default", "default");
}

/** One-line report for `get` — stored, owner, effective value, problem. */
export function formatSettingInfo(info: ConfigValueInfo): string {
  if (!info.known) {
    const raw =
      info.stored === null || info.stored === undefined
        ? tr("cli.notStored", "not stored")
        : typeof info.stored === "string"
          ? info.stored
          : JSON.stringify(info.stored);
    const structured =
      typeof info.stored === "object" && info.stored !== null
        ? tr("cli.structured", "structured value — edit in settings.json")
        : tr("cli.unknownSetting", "not a registered setting");
    return `${info.path} = ${raw} · ${sourceWord(info.source)} · ${structured}`;
  }
  const stored =
    info.source === "default"
      ? tr("cli.usingDefault", "not stored — using default")
      : `${info.stored === null ? "null" : String(info.stored)} · ${sourceWord(info.source)}`;
  const effective =
    info.effective === null ? tr("cli.noEffective", "—") : String(info.effective);
  let line = `${info.path} = ${stored} → ${tr("cli.effective", "effective")}: ${effective}`;
  if (info.problem) line += ` · ⚠ ${info.problem}`;
  else if (info.hint) line += ` · ${info.hint}`;
  return line;
}

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
function editDistanceWithin(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr.push(Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost));
    }
    if (Math.min(...curr) > max) return false;
    prev = curr;
  }
  return prev[b.length]! <= max;
}

// ---------------------------------------------------------------------------
// Completion (pure)
// ---------------------------------------------------------------------------

const CLI_SUBCOMMANDS: ReadonlyArray<{ value: string; description: string }> = [
  { value: "get", description: "Show one setting: stored, source, effective" },
  { value: "set", description: "Change one setting (validated)" },
  { value: "unset", description: "Remove one setting (back to default)" },
  { value: "settings", description: "Open the flat settings TUI" },
  { value: "setup", description: "First-run setup wizard" },
  { value: "doctor", description: "Configuration diagnosis" },
  { value: "help", description: "Show CLI usage" },
];

function startsWith(value: string, prefix: string): boolean {
  return value.toLowerCase().startsWith(prefix.toLowerCase());
}

function tokenize(argumentPrefix: string): {
  tokens: string[];
  lastComplete: boolean;
} {
  const trimmedStart = argumentPrefix.replace(/^\s+/, "");
  if (trimmedStart === "") return { tokens: [], lastComplete: true };
  return {
    tokens: trimmedStart.split(/\s+/).filter(Boolean),
    lastComplete: /\s$/.test(argumentPrefix),
  };
}

function pathCompletions(
  verb: string,
  pathPrefix: string,
): AutocompleteItem[] {
  return SETTINGS_REGISTRY.filter((definition) =>
    startsWith(definition.path, pathPrefix) ||
    startsWith(definition.id, pathPrefix),
  ).map((definition) => ({
    value: `${verb} ${definition.path}`,
    label: definition.path,
    description: `${settingLabel(definition)} · ${definition.kind}`,
  }));
}

function valueCompletions(
  path: string,
  valuePrefix: string,
): AutocompleteItem[] | null {
  const definition = getSettingDefinition(path);
  if (!definition) return null;
  let choices: readonly string[] = [];
  if (definition.kind === "select") choices = definition.choices;
  else if (definition.kind === "toggle") choices = ["on", "off"];
  else return null;
  const items = choices
    .filter((choice) => startsWith(choice, valuePrefix))
    .map((choice) => ({
      value: `set ${definition.path} ${choice}`,
      label: choice,
      description: `${settingLabel(definition)} → ${choice}`,
    }));
  return items.length > 0 ? items : null;
}

/**
 * Tab completion for `/wishcraft …`:
 *   /wishcraft <tab>            → subcommands
 *   /wishcraft se<tab>          → set / settings / setup
 *   /wishcraft set <tab>        → every registered path
 *   /wishcraft set powerline.<tab> → matching paths
 *   /wishcraft set <path> <tab> → choices / on·off for that setting
 */
export function getWishcraftArgumentCompletions(
  argumentPrefix: string,
): AutocompleteItem[] | null {
  const { tokens, lastComplete } = tokenize(argumentPrefix);
  const isVerb = (token: string | undefined): boolean =>
    token !== undefined && ["get", "set", "unset"].includes(token.toLowerCase());

  if (tokens.length === 0) {
    return subcommandCompletions("");
  }

  if (tokens.length === 1) {
    const verb = tokens[0]!.toLowerCase();
    if (lastComplete) {
      // `set <tab>` — the path list opens right after the verb.
      if (isVerb(verb)) {
        const items = pathCompletions(verb, "");
        return items.length > 0 ? items : null;
      }
      return null;
    }
    const items = subcommandCompletions(tokens[0]!);
    return items.length > 0 ? items : null;
  }

  if (tokens.length === 2) {
    if (!isVerb(tokens[0])) return null;
    const verb = tokens[0]!.toLowerCase();
    if (!lastComplete) {
      // Path being typed: `/wishcraft set powerl…`
      const items = pathCompletions(verb, tokens[1]!);
      return items.length > 0 ? items : null;
    }
    // `set <path> <tab>` — offer the values that setting accepts.
    return verb === "set" ? valueCompletions(tokens[1]!, "") : null;
  }

  if (tokens.length === 3 && !lastComplete && isVerb(tokens[0]) && tokens[0]!.toLowerCase() === "set") {
    // Value being typed: `/wishcraft set motion.level red…`
    return valueCompletions(tokens[1]!, tokens[2]!);
  }

  return null;
}

function subcommandCompletions(prefix: string): AutocompleteItem[] {
  const items: AutocompleteItem[] = [];
  for (const sub of CLI_SUBCOMMANDS) {
    if (!prefix || startsWith(sub.value, prefix)) {
      items.push({
        value: sub.value,
        label: sub.value,
        description: sub.description,
      });
    }
  }
  return items;
}

// ---------------------------------------------------------------------------
// Runner (side effects live only here)
// ---------------------------------------------------------------------------

export const CONFIG_CLI_USAGE =
  "/wishcraft get <setting> · set <setting> <value> · unset <setting> · settings · doctor";

function postWrite(rt: RuntimeState, cwd: string, path: string): void {
  const settings = readSettings(cwd);
  syncLocaleFromSettings(settings);
  invalidateConfigDiagnosticsCache();
  if (path.startsWith("powerline")) {
    reloadPowerlineFromSettings(rt, settings);
  }
}

function writeTarget(cwd: string, rootKey: string): SettingSource {
  const project = readSettingsFile(getProjectSettingsPath(cwd));
  return Object.prototype.hasOwnProperty.call(project, rootKey)
    ? "project"
    : "global";
}

/** Execute one parsed CLI invocation. Every outcome is a single notify line. */
export function runConfigCli(
  rt: RuntimeState,
  ctx: any,
  cwd: string,
  args: ConfigCliArgs,
): void {
  if (args.verb === "help") {
    ctx.ui.notify(CONFIG_CLI_USAGE, "info");
    return;
  }

  if (args.verb === "get") {
    if (!args.path) {
      ctx.ui.notify(
        tr("cli.needPath", "Usage: /wishcraft get <setting>"),
        "warning",
      );
      return;
    }
    const info = inspectSetting(
      readSettingsFile(getSettingsPath()),
      readSettingsFile(getProjectSettingsPath(cwd)),
      args.path,
    );
    ctx.ui.notify(formatSettingInfo(info), "info");
    return;
  }

  if (args.verb === "set") {
    if (!args.path) {
      ctx.ui.notify(
        tr("cli.needPathSet", "Usage: /wishcraft set <setting> <value>"),
        "warning",
      );
      return;
    }
    if (!args.value) {
      const definition = getSettingDefinition(args.path);
      const expected = definition
        ? definition.kind === "select"
          ? definition.choices.join(" · ")
          : definition.kind === "toggle"
            ? "on · off"
            : definition.kind === "number"
              ? tr("cli.numberValue", "<number>")
              : tr("cli.textValue", "<text>")
        : tr("cli.textValue", "<text>");
      ctx.ui.notify(
        tr("cli.needValue", "Usage: /wishcraft set {path} <value> — {expected}", {
          path: definition?.path ?? args.path,
          expected,
        }),
        "warning",
      );
      return;
    }

    const result = applyConfigSet(cwd, args.path, args.value);
    if (!result.ok) {
      ctx.ui.notify(result.message, "warning");
      return;
    }
    postWrite(rt, cwd, result.path);
    const target = writeTarget(cwd, result.path.split(".")[0]!);
    const suffix = result.restartRequired
      ? ` · ${tr("config.restartNeeded", "restart required to take effect")}`
      : "";
    ctx.ui.notify(
      tr("cli.saved", "{label} = {value} (saved to {target})", {
        label: result.label,
        value: result.display,
        target: sourceWord(target),
      }) + suffix,
      "info",
    );
    return;
  }

  // unset
  if (!args.path) {
    ctx.ui.notify(
      tr("cli.needPathUnset", "Usage: /wishcraft unset <setting>"),
      "warning",
    );
    return;
  }
  const result = applyConfigUnset(cwd, args.path);
  if (!result.ok) {
    ctx.ui.notify(result.message, "warning");
    return;
  }
  postWrite(rt, cwd, result.path);
  ctx.ui.notify(
    tr("cli.removed", "{label} removed — effective value: {value}", {
      label: result.label,
      value: result.effective,
    }),
    "info",
  );
}
