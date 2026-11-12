/**
 * config-cli-read.ts — `get` lane: path readers + inspectSetting + display.
 * ------------------------------------------------------------------------
 * Split from config-cli.ts — pure lanes; the facade re-exports the public
 * surface so the single consumer (wishcraft-config.ts) is unchanged.
 * ---------------------------------------------------------------------------
 */

import {
  effectiveSettingValue,
  getSettingDefinition,
  settingHint,
  settingLabel,
  validationProblem,
  type SettingValue,
} from "../../config/settings-registry.ts";import { tr } from "../../i18n/index.ts";
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

export function sourceWord(source: SettingSource): string {
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

