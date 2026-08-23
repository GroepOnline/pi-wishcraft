// Barrel file: this module's implementation has been split into cohesive
// internal files below. Re-exported here to keep a stable public import
// path (`./config/powerline-config.ts`) for the rest of the codebase.
export type { PowerlineConfig } from "./parse.ts";
export { parsePowerlineConfig } from "./parse.ts";
export { mergeSegmentOptions } from "./segment-options.ts";
export { mergeSegmentsWithCustomItems } from "./layout.ts";
export {
  deriveAutoCustomItems,
  normalizeCustomItemsAuto,
} from "./custom-items.ts";
export {
  nextPowerlineSettingWithCustomPreset,
  nextPowerlineSettingWithPreset,
  nextPowerlineSettingWithOptions,
} from "./settings-patch.ts";
export {
  collectHiddenExtensionStatusKeys,
  isNotificationExtensionStatus,
  getNotificationExtensionStatuses,
  normalizeExtensionStatusValue,
  normalizeCompactExtensionStatus,
} from "./extension-statuses.ts";
