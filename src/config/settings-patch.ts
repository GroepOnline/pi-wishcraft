import { isRecord } from "./primitives.ts";
import type { PowerlineConfig } from "./parse.ts";
import type { CustomPresetConfig, StatusLinePreset } from "./types.ts";

export function nextPowerlineSettingWithPreset(
  existingPowerlineSetting: unknown,
  preset: StatusLinePreset,
): unknown {
  if (!isRecord(existingPowerlineSetting)) {
    return preset;
  }
  return { ...existingPowerlineSetting, preset };
}

export function nextPowerlineSettingWithCustomPreset(
  existingPowerlineSetting: unknown,
  name: string,
  presetDef: CustomPresetConfig,
): unknown {
  if (!isRecord(existingPowerlineSetting)) {
    return { preset: name, presets: { [name]: presetDef } };
  }
  const existingPresets = isRecord(existingPowerlineSetting.presets)
    ? existingPowerlineSetting.presets
    : {};
  return {
    ...existingPowerlineSetting,
    preset: name,
    presets: { ...existingPresets, [name]: presetDef },
  };
}

export function nextPowerlineSettingWithOptions(
  existingPowerlineSetting: unknown,
  updates: Partial<
    Pick<
      PowerlineConfig,
      "welcome" | "stashSharpSShortcut" | "placement" | "disabledSegments"
    >
  >,
  currentPreset: StatusLinePreset,
): unknown {
  if (!isRecord(existingPowerlineSetting)) {
    return { preset: currentPreset, ...updates };
  }
  return { ...existingPowerlineSetting, ...updates };
}
