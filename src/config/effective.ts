/**
 * Effective config resolver (U1, KTD4/5).
 *
 * Treats `SETTINGS_REGISTRY` as the single source of truth: every value the
 * caller reads is a registered key, every unknown key is ignored, and every
 * invalid value falls back to the registered default with a per-path error
 * entry. The previous `parsePowerlineConfig` is a v1 consumer; new code reads
 * through this resolver so powerline + skills + harness settings all live in
 * one shape. Strangler: v1 still works until U11 cuts over.
 */

import {
  getSettingDefinition,
  SETTING_DEFAULTS,
  SETTINGS_REGISTRY,
  type SettingDefinition,
  type SettingValue,
} from "./settings-registry.ts";

export type SettingPath = keyof typeof SETTING_DEFAULTS;

export type SettingInput = Record<string, unknown>;

export interface SettingError {
  path: string;
  message: string;
  rawValue: unknown;
}

export interface EffectiveConfig {
  values: Record<SettingPath, SettingValue>;
  errors: SettingError[];
}

export const SETTING_PATHS: readonly SettingPath[] = Object.keys(
  SETTING_DEFAULTS,
) as SettingPath[];

function coerceToggle(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "on" || value === "true" || value === 1) return true;
  if (value === "off" || value === "false" || value === 0) return false;
  return null;
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    // Full-string conversion: "1000ms" and friends must not silently
    // coerce to a number; invalid values fall back to the default.
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function coerceText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function coerceSelect(value: unknown, choices: readonly string[]): string | null {
  if (typeof value !== "string") return null;
  return choices.includes(value) ? value : null;
}

function coerce(definition: SettingDefinition, value: unknown): SettingValue | null {
  if (definition.kind === "toggle") {
    const coerced = coerceToggle(value);
    return coerced;
  }
  if (definition.kind === "number") {
    return coerceNumber(value);
  }
  if (definition.kind === "text") {
    return coerceText(value);
  }
  return coerceSelect(value, definition.choices);
}

function defaultFor(definition: SettingDefinition): SettingValue | null {
  if (definition.defaultValue !== undefined) return definition.defaultValue;
  if (definition.kind === "toggle") return false;
  if (definition.kind === "number") return 0;
  if (definition.kind === "text") return "";
  return "";
}

export function resolveEffectiveConfig(input: SettingInput = {}): EffectiveConfig {
  const values = {} as Record<SettingPath, SettingValue>;
  const errors: SettingError[] = [];

  for (const path of SETTING_PATHS) {
    const definition = getSettingDefinition(path);
    if (!definition) continue;
    const raw = input[path];
    if (raw === undefined) {
      const fallback = defaultFor(definition);
      if (fallback !== null) values[path] = fallback;
      continue;
    }
    const coerced = coerce(definition, raw);
    if (coerced === null) {
      const fallback = defaultFor(definition);
      if (fallback !== null) values[path] = fallback;
      errors.push({
        path,
        message: `Invalid value for ${path}; using default.`,
        rawValue: raw,
      });
      continue;
    }
    values[path] = coerced;
  }

  return { values, errors };
}

export function knownSettings(): readonly SettingDefinition[] {
  return SETTINGS_REGISTRY;
}
