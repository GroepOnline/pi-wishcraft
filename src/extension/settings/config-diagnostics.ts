/**
 * config-diagnostics.ts
 * ---------------------------------------------------------------------------
 * One-screen diagnosis of *where every setting comes from and what is wrong
 * with it*.
 *
 * `/signal doctor` already reports on the environment (git, nerd fonts, queue
 * files). This module answers the other half of the operator's question: which
 * settings.json is winning, which keys are shadowed, which keys are typos, and
 * which stored values are being thrown away. Pure: it only reads files and
 * returns data — no UI, no mutation, so it is unit-testable headlessly.
 * ---------------------------------------------------------------------------
 */

import { existsSync, readFileSync, statSync } from "node:fs";

import {
  SETTING_GROUPS,
  SETTINGS_REGISTRY,
  effectiveSettingValue,
  explainSettingValue,
  settingGroupTitle,
  settingLabel,
  validationProblem,
  type SettingDefinition,
  type SettingValue,
} from "../../config/settings-registry.ts";
import { tr } from "../../i18n/index.ts";
import {
  getProjectSettingsPath,
  getSettingsPath,
  isRecord,
} from "./settings-io.ts";

export type DiagnosticSeverity = "ok" | "warn" | "fail";

export interface SettingsFileReport {
  scope: "global" | "project";
  path: string;
  exists: boolean;
  validJson: boolean;
  keyCount: number;
  /** Parse error message when the file exists but is not readable JSON. */
  error: string | null;
}

/** A leaf path whose value differs between the global and project files. */
export interface ConfigConflict {
  /** Dotted path below the settings root, e.g. `powerline.preset`. */
  path: string;
  globalValue: string;
  projectValue: string;
}

/** A key the settings writer produces but no consumer reads (typically a typo). */
export interface UnknownKey {
  scope: "global" | "project";
  /** Dotted path of the unknown key. */
  path: string;
  /** Closest known key when one is within edit distance 2, else `null`. */
  suggestion: string | null;
}

export type SettingSource = "global" | "project" | "default";

export interface SettingDiagnosis {
  id: string;
  path: string;
  groupTitle: string;
  label: string;
  hint?: string;
  source: SettingSource;
  stored: unknown;
  effective: SettingValue | null;
  /** Localised, actionable explanation when the stored value is unusable. */
  problem: string | null;
}

export interface ConfigDiagnostics {
  files: SettingsFileReport[];
  conflicts: ConfigConflict[];
  unknownKeys: UnknownKey[];
  settings: SettingDiagnosis[];
  counts: {
    total: number;
    stored: number;
    defaulted: number;
    invalid: number;
    conflicts: number;
    unknown: number;
  };
  /** Rolled-up checks, ready for a generic `[ok]/[warn]/[fail]` list view. */
  checks: { severity: DiagnosticSeverity; name: string; detail: string }[];
}

/**
 * Keys directly under `powerline` that `parsePowerlineConfig` consumes.
 * Anything else under that root is written and then never read.
 */
const KNOWN_POWERLINE_KEYS = new Set([
  "preset",
  "layout",
  "separator",
  "placement",
  "welcome",
  "stashSharpSShortcut",
  "costAlert",
  "customItems",
  "customItemsAuto",
  "disabledSegments",
  "segmentOptions",
  "segmentLabels",
  "segments",
  "presets",
  "queue",
  "appearance",
  "motionLevel",
  // read by the i18n layer rather than the powerline parser
  "locale",
]);

/** Keys directly under `wishcraft` with no registry entry but a live reader. */
const KNOWN_WISHCRAFT_EXTRA = new Set([
  "locale",
  "welcome",
  "bashMode",
  "queue",
  "budget",
]);

const MANAGED_ROOTS = ["powerline", "wishcraft", "powerlineShortcuts"] as const;

function readJsonFile(path: string): {
  exists: boolean;
  validJson: boolean;
  keyCount: number;
  value: Record<string, unknown>;
  error: string | null;
} {
  if (!existsSync(path)) {
    return { exists: false, validJson: true, keyCount: 0, value: {}, error: null };
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    if (!isRecord(parsed)) {
      return {
        exists: true,
        validJson: false,
        keyCount: 0,
        value: {},
        error: "root is not a JSON object",
      };
    }
    return {
      exists: true,
      validJson: true,
      keyCount: Object.keys(parsed).length,
      value: parsed,
      error: null,
    };
  } catch (error) {
    return {
      exists: true,
      validJson: false,
      keyCount: 0,
      value: {},
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function reportFile(
  scope: "global" | "project",
  path: string,
  read: ReturnType<typeof readJsonFile>,
): SettingsFileReport {
  return {
    scope,
    path,
    exists: read.exists,
    validJson: read.validJson,
    keyCount: read.keyCount,
    error: read.error,
  };
}

/** Flatten only the managed roots, so unrelated pi keys never show up. */
function flattenManagedLeaves(
  settings: Record<string, unknown>,
  prefix = "",
  out = new Map<string, string>(),
  depth = 0,
): Map<string, string> {
  if (depth > 5) return out;
  for (const [key, value] of Object.entries(settings)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (!prefix && !(MANAGED_ROOTS as readonly string[]).includes(key)) continue;
    if (isRecord(value) && Object.keys(value).length > 0) {
      flattenManagedLeaves(value, path, out, depth + 1);
    } else {
      try {
        out.set(path, JSON.stringify(value) ?? String(value));
      } catch {
        out.set(path, String(value));
      }
    }
  }
  return out;
}

/** Levenshtein distance capped at 2 — only used for "did you mean" hints. */
function editDistanceAtMost2(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 2) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
    }
    if (Math.min(...curr) > 2) return false;
    prev = curr;
  }
  return prev[b.length]! <= 2;
}

function knownKeysFor(root: string): string[] {
  const known = new Set<string>();
  if (root === "powerline") {
    for (const key of KNOWN_POWERLINE_KEYS) known.add(key);
  } else if (root === "wishcraft") {
    for (const key of KNOWN_WISHCRAFT_EXTRA) known.add(key);
  }
  for (const definition of SETTINGS_REGISTRY) {
    const parts = definition.path.split(".");
    if (parts[0] !== root || parts.length < 2) continue;
    known.add(parts[1]!);
  }
  return [...known];
}

function detectUnknownKeys(
  scope: "global" | "project",
  settings: Record<string, unknown>,
): UnknownKey[] {
  const found: UnknownKey[] = [];
  for (const root of MANAGED_ROOTS) {
    const subtree = settings[root];
    if (!isRecord(subtree)) continue;
    const known = knownKeysFor(root);
    for (const key of Object.keys(subtree)) {
      if (known.includes(key)) continue;
      const near = known.find((candidate) => editDistanceAtMost2(candidate, key));
      found.push({
        scope,
        path: `${root}.${key}`,
        // Repeat the root so the suggestion is a copy-pasteable path.
        suggestion: near ? `${root}.${near}` : null,
      });
    }
  }
  return found;
}

function detectConflicts(
  globalSettings: Record<string, unknown>,
  projectSettings: Record<string, unknown>,
): ConfigConflict[] {
  const globalLeaves = flattenManagedLeaves(globalSettings);
  const projectLeaves = flattenManagedLeaves(projectSettings);
  const conflicts: ConfigConflict[] = [];
  for (const [path, projectValue] of projectLeaves) {
    const globalValue = globalLeaves.get(path);
    if (globalValue !== undefined && globalValue !== projectValue) {
      conflicts.push({ path, globalValue, projectValue });
    }
  }
  return conflicts;
}

function diagnoseSettings(
  globalSettings: Record<string, unknown>,
  projectSettings: Record<string, unknown>,
): SettingDiagnosis[] {
  const groupTitles = new Map(
    SETTING_GROUPS.map((group) => [group.id, settingGroupTitle(group)]),
  );

  // `SETTINGS_REGISTRY` is `as const`, so its element type is a precise
  // literal union that does not carry the optional `hint`/`min` members.
  // Widening to the declared shape is safe and keeps `.hint` accessible.
  return (SETTINGS_REGISTRY as readonly SettingDefinition[]).map((definition) => {
    const has = (settings: Record<string, unknown>) => {
      const parts = definition.path.split(".");
      let cursor: unknown = settings;
      for (const part of parts) {
        if (!isRecord(cursor) || !(part in cursor)) return false;
        cursor = (cursor as Record<string, unknown>)[part];
      }
      return true;
    };

    let source: SettingSource = "default";
    let stored: unknown = null;
    if (has(projectSettings)) {
      source = "project";
      stored = readPath(projectSettings, definition.path);
    } else if (has(globalSettings)) {
      source = "global";
      stored = readPath(globalSettings, definition.path);
    }

    const effective = effectiveSettingValue(definition, stored);
    const problem =
      source === "default"
        ? null
        : validationProblem(definition, stored, effective);

    return {
      id: definition.id,
      path: definition.path,
      groupTitle: groupTitles.get(definition.group) ?? definition.group,
      label: settingLabel(definition),
      hint: definition.hint,
      source,
      stored,
      effective,
      problem,
    };
  });
}

function readPath(settings: Record<string, unknown>, path: string): unknown {
  let cursor: unknown = settings;
  for (const part of path.split(".")) {
    if (!isRecord(cursor)) return null;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
}

/** Build the full one-screen report. Pure apart from reading the two files. */
export function buildConfigDiagnostics(
  cwd: string = process.cwd(),
): ConfigDiagnostics {
  const globalPath = getSettingsPath();
  const projectPath = getProjectSettingsPath(cwd);

  const globalRead = readJsonFile(globalPath);
  const projectRead = readJsonFile(projectPath);

  const files = [
    reportFile("global", globalPath, globalRead),
    reportFile("project", projectPath, projectRead),
  ];

  // An unreadable file is a hard failure: the operator's edits are invisible.
  const globalSettings = globalRead.validJson ? globalRead.value : {};
  const projectSettings = projectRead.validJson ? projectRead.value : {};

  const conflicts = detectConflicts(globalSettings, projectSettings);
  const unknownKeys = [
    ...detectUnknownKeys("global", globalSettings),
    ...detectUnknownKeys("project", projectSettings),
  ];
  const settings = diagnoseSettings(globalSettings, projectSettings);

  const counts = {
    total: settings.length,
    stored: settings.filter((row) => row.source !== "default").length,
    defaulted: settings.filter((row) => row.source === "default").length,
    invalid: settings.filter((row) => row.problem !== null).length,
    conflicts: conflicts.length,
    unknown: unknownKeys.length,
  };

  const checks: ConfigDiagnostics["checks"] = [];

  for (const file of files) {
    const label = tr(
      file.scope === "global" ? "diag.globalFile" : "diag.projectFile",
      file.scope === "global" ? "global" : "project",
    );
    if (!file.exists) {
      checks.push({
        severity: "ok",
        name: `settings.${file.scope}`,
        detail: `${label}: ${tr("diag.fileMissing", "not present (defaults in use)")}`,
      });
    } else if (!file.validJson) {
      checks.push({
        severity: "fail",
        name: `settings.${file.scope}`,
        detail: `${label}: ${tr("diag.fileInvalid", "INVALID JSON — ignored")} — ${file.path}${file.error ? ` (${file.error})` : ""}`,
      });
    } else {
      checks.push({
        severity: "ok",
        name: `settings.${file.scope}`,
        detail: `${label}: ${tr("diag.fileValid", "valid JSON")} (${file.keyCount}) — ${file.path}`,
      });
    }
  }

  if (conflicts.length > 0) {
    for (const conflict of conflicts) {
      checks.push({
        severity: "warn",
        name: `conflict:${conflict.path}`,
        detail: `${conflict.path}: ${conflict.globalValue} → ${conflict.projectValue} (${tr("diag.projectWins", "project overrides global")})`,
      });
    }
  } else {
    checks.push({
      severity: "ok",
      name: "conflicts",
      detail: tr("diag.noConflicts", "no conflicts"),
    });
  }

  for (const unknown of unknownKeys) {
    checks.push({
      severity: "warn",
      name: `unknown:${unknown.path}`,
      detail: unknown.suggestion
        ? `${unknown.path} → ${tr("diag.didYouMean", "did you mean")} ${unknown.suggestion}?`
        : `${unknown.path} — ${tr("diag.notRead", "no reader consumes this key")}`,
    });
  }
  if (unknownKeys.length === 0) {
    checks.push({
      severity: "ok",
      name: "unknownKeys",
      detail: tr("diag.noUnknown", "no unknown keys"),
    });
  }

  for (const row of settings) {
    if (!row.problem) continue;
    checks.push({
      severity: "warn",
      name: `invalid:${row.id}`,
      detail: `${row.path}: ${row.problem}`,
    });
  }

  checks.push({
    severity: counts.invalid > 0 ? "warn" : "ok",
    name: "summary",
    detail: tr(
      "diag.summary",
      "{total} settings · {stored} stored · {defaulted} default · {invalid} invalid",
      counts,
    ),
  });

  return { files, conflicts, unknownKeys, settings, counts, checks };
}

function fileSignature(path: string): string {
  try {
    const stat = statSync(path);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return "missing";
  }
}

let cachedReport: { signature: string; report: ConfigDiagnostics } | null = null;

/**
 * Memoised diagnosis for render paths. The Deck repaints on every tick, so
 * re-reading both settings files per frame would be wasteful; the signature
 * re-reads only when either file actually changes (or a file is created /
 * deleted, which flips `missing` ↔ a real signature).
 */
export function getCachedConfigDiagnostics(
  cwd: string = process.cwd(),
): ConfigDiagnostics {
  const signature = `${fileSignature(getSettingsPath())}|${fileSignature(getProjectSettingsPath(cwd))}|${cwd}`;
  if (cachedReport && cachedReport.signature === signature) {
    return cachedReport.report;
  }
  const report = buildConfigDiagnostics(cwd);
  cachedReport = { signature, report };
  return report;
}

/** Drop the memo (tests, and after a settings write). */
export function invalidateConfigDiagnosticsCache(): void {
  cachedReport = null;
}

/** Whether a stored value survives validation for this definition. */
export function isStoredValueValid(
  definition: SettingDefinition,
  stored: unknown,
): boolean {
  return explainSettingValue(definition, stored).ok;
}
