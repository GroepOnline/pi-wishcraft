/**
 * config-cli-complete.ts — autocomplete lane for the prompt surface.
 * ------------------------------------------------------------------------
 * Split from config-cli.ts — pure lanes; the facade re-exports the public
 * surface so the single consumer (wishcraft-config.ts) is unchanged.
 * ---------------------------------------------------------------------------
 */

import type { AutocompleteItem } from "@earendil-works/pi-tui";
import {
  SETTINGS_REGISTRY,
  getSettingDefinition,
  settingLabel,
  } from "../../config/settings-registry.ts";
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

