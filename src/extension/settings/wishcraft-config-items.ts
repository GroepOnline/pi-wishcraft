/** Data-driven groups for `/wishcraft settings`, derived from the canonical registry. */
import {
  SETTINGS_REGISTRY,
  SETTING_GROUPS,
  type SettingDefinition,
  type SettingValue,
} from "../../config/settings-registry.ts";

export type ConfigValue = SettingValue | null;
export type ConfigItem = SettingDefinition;

export interface ConfigGroup {
  title: string;
  items: ConfigItem[];
}

/** Build the operator groups from the canonical registry. */
export function buildConfigGroups(_settings: Record<string, unknown>): ConfigGroup[] {
  return SETTING_GROUPS.map((group) => ({
    title: group.title,
    items: SETTINGS_REGISTRY.filter((item) => item.group === group.id),
  }));
}
