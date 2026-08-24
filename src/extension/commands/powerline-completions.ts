import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { PRESETS } from "../../config/presets.ts";

export const POWERLINE_PLACEMENT_VALUES = ["above", "below", "toggle"] as const;

export const POWERLINE_SUBCOMMANDS: ReadonlyArray<{
  value: string;
  description: string;
}> = [
  {
    value: "doctor",
    description: "Run environment and settings diagnostics",
  },
  {
    value: "export",
    description: "Export the current status-line configuration",
  },
  {
    value: "placement",
    description: "Move the primary row above or below the editor",
  },
  {
    value: "menu",
    description: "Open Navigate / Configure / Status",
  },
];

const PLACEMENT_DESCRIPTIONS: Record<(typeof POWERLINE_PLACEMENT_VALUES)[number], string> = {
  above: "Primary row above the editor",
  below: "Primary row below the editor",
  toggle: "Switch between above and below",
};

export function listPowerlinePresetNames(
  presetNames: readonly string[] = Object.keys(PRESETS),
): string[] {
  return [...presetNames];
}

function startsWithPrefix(value: string, prefix: string): boolean {
  return value.toLowerCase().startsWith(prefix.toLowerCase());
}

function tokenizeArgs(argumentPrefix: string): {
  tokens: string[];
  lastComplete: boolean;
} {
  const trimmedStart = argumentPrefix.replace(/^\s+/, "");
  if (trimmedStart === "") {
    return { tokens: [], lastComplete: true };
  }
  return {
    tokens: trimmedStart.split(/\s+/).filter(Boolean),
    lastComplete: /\s$/.test(argumentPrefix),
  };
}

function placementCompletions(valuePrefix: string): AutocompleteItem[] {
  return POWERLINE_PLACEMENT_VALUES.filter((value) =>
    startsWithPrefix(value, valuePrefix),
  ).map((value) => ({
    value: `placement ${value}`,
    label: value,
    description: PLACEMENT_DESCRIPTIONS[value],
  }));
}

export function getPowerlineArgumentCompletions(
  argumentPrefix: string,
  presetNames: readonly string[] = Object.keys(PRESETS),
): AutocompleteItem[] | null {
  const { tokens, lastComplete } = tokenizeArgs(argumentPrefix);
  const first = tokens[0] ?? "";
  // The command grammar has only one optional placement value. Do not offer
  // a replacement once the user has started a third argument.
  if (tokens.length > 2 || (tokens.length === 2 && lastComplete)) {
    return null;
  }

  const completingSecond =
    first.toLowerCase() === "placement" &&
    ((tokens.length === 1 && lastComplete) ||
      (tokens.length === 2 && !lastComplete));

  if (completingSecond) {
    const valuePrefix = tokens.length > 1 ? tokens[1] : "";
    const items = placementCompletions(valuePrefix);
    return items.length > 0 ? items : null;
  }

  if (tokens.length > 1) {
    return null;
  }

  const prefix = first;
  const items: AutocompleteItem[] = [];

  for (const sub of POWERLINE_SUBCOMMANDS) {
    if (!prefix || startsWithPrefix(sub.value, prefix)) {
      items.push({
        value: sub.value,
        label: sub.value,
        description: sub.description,
      });
    }
  }

  for (const name of listPowerlinePresetNames(presetNames)) {
    if (!prefix || startsWithPrefix(name, prefix)) {
      items.push({
        value: name,
        label: name,
        description: `Switch to the ${name} preset`,
      });
    }
  }

  return items.length > 0 ? items : null;
}
