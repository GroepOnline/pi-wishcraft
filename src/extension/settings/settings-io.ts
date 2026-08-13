import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

import type { StatusLinePreset } from "../../config/types.ts";
import type { PowerlineConfig } from "../../config/powerline-config.ts";
import {
  nextPowerlineSettingWithOptions,
  nextPowerlineSettingWithPreset,
} from "../../config/powerline-config.ts";
import { getAgentPath } from "../../paths/agent-dirs.ts";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getSettingsPath(): string {
  return getAgentPath("settings.json");
}

export function getProjectSettingsPath(cwd: string): string {
  return join(cwd, ".pi", "settings.json");
}

export function getGlobalCompactionPolicyPath(): string {
  return getAgentPath("compaction-policy.json");
}

export function getCustomCompactionExtensionPath(): string {
  return getAgentPath("extensions", "pi-custom-compaction");
}

export function mergeSettings(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };

  for (const [key, overrideValue] of Object.entries(override)) {
    const baseValue = merged[key];
    merged[key] =
      isRecord(baseValue) && isRecord(overrideValue)
        ? mergeSettings(baseValue, overrideValue)
        : overrideValue;
  }

  return merged;
}

export function readSettingsFile(
  settingsPath: string,
): Record<string, unknown> {
  try {
    if (!existsSync(settingsPath)) {
      return {};
    }

    const parsed = JSON.parse(readFileSync(settingsPath, "utf-8"));
    if (!isRecord(parsed)) {
      console.debug(
        `[wishcraft] Ignoring non-object settings at ${settingsPath}`,
      );
      return {};
    }

    return parsed;
  } catch (error) {
    // Settings are user-edited input. Log and keep the extension running with defaults
    // instead of crashing the UI during startup.
    console.debug(
      `[wishcraft] Failed to read settings from ${settingsPath}:`,
      error,
    );
    return {};
  }
}

export function readWritableSettingsFile(
  settingsPath: string,
): Record<string, unknown> | null {
  if (!existsSync(settingsPath)) {
    return {};
  }

  try {
    const parsed = JSON.parse(readFileSync(settingsPath, "utf-8"));
    if (!isRecord(parsed)) {
      console.debug(
        `[wishcraft] Refusing to write settings to non-object file at ${settingsPath}`,
      );
      return null;
    }

    return parsed;
  } catch (error) {
    // Do not overwrite malformed user settings with partial data. Surface the failure
    // through the command handler so the user can fix the file intentionally.
    console.debug(
      `[wishcraft] Failed to parse settings at ${settingsPath}:`,
      error,
    );
    return null;
  }
}

export function readCompactionPolicyEnabled(
  configPath: string,
): boolean | undefined {
  if (!existsSync(configPath)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf-8"));
    if (!isRecord(parsed) || typeof parsed.enabled !== "boolean") return false;
    return parsed.enabled;
  } catch (error) {
    console.debug(
      `[wishcraft] Failed to read compaction policy from ${configPath}:`,
      error,
    );
    return false;
  }
}

export function detectCustomCompactionEnabled(cwd: string): boolean {
  if (!existsSync(getCustomCompactionExtensionPath())) return false;

  const projectSetting = readCompactionPolicyEnabled(
    join(cwd, ".pi", "compaction-policy.json"),
  );
  if (projectSetting !== undefined) return projectSetting;

  return readCompactionPolicyEnabled(getGlobalCompactionPolicyPath()) ?? false;
}

export function readSettings(
  cwd: string = process.cwd(),
): Record<string, unknown> {
  return mergeSettings(
    readSettingsFile(getSettingsPath()),
    readSettingsFile(getProjectSettingsPath(cwd)),
  );
}

export function writePowerlineSetting(
  cwd: string,
  update: (existingPowerlineSetting: unknown) => unknown,
): boolean {
  const globalSettingsPath = getSettingsPath();
  const projectSettingsPath = getProjectSettingsPath(cwd);
  const globalSettings = readWritableSettingsFile(globalSettingsPath);
  const projectSettings = readWritableSettingsFile(projectSettingsPath);

  if (globalSettings === null || projectSettings === null) {
    return false;
  }

  const writeToProject = Object.prototype.hasOwnProperty.call(
    projectSettings,
    "powerline",
  );
  const settingsPath = writeToProject
    ? projectSettingsPath
    : globalSettingsPath;
  const settings = writeToProject ? projectSettings : globalSettings;

  settings.powerline = update(settings.powerline);

  try {
    mkdirSync(dirname(settingsPath), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
    return true;
  } catch (error) {
    console.debug(
      `[wishcraft] Failed to persist powerline setting to ${settingsPath}:`,
      error,
    );
    return false;
  }
}

export function writePowerlinePresetSetting(
  preset: StatusLinePreset,
  cwd: string = process.cwd(),
): boolean {
  return writePowerlineSetting(cwd, (existingPowerlineSetting) =>
    nextPowerlineSettingWithPreset(existingPowerlineSetting, preset),
  );
}

export function writePowerlineOptionSetting(
  cwd: string,
  updates: Partial<
    Pick<PowerlineConfig, "welcome" | "stashSharpSShortcut" | "placement">
  >,
  currentPreset: StatusLinePreset,
): boolean {
  return writePowerlineSetting(cwd, (existingPowerlineSetting) =>
    nextPowerlineSettingWithOptions(
      existingPowerlineSetting,
      updates,
      currentPreset,
    ),
  );
}
