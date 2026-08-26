import {
  normalizeCustomItems,
  normalizeCustomItemsAuto,
  normalizeCustomPresets,
  normalizeCustomSegments,
} from "./custom-items.ts";
import {
  isRecord,
  normalizeCaptureSigil,
  normalizeCostAlert,
  normalizePlacement,
  normalizePreset,
  normalizeRetentionHours,
  normalizeSegmentLabels,
  normalizeSeparator,
} from "./primitives.ts";
import { normalizeDisabledSegments, normalizeLayout } from "./segment-ids.ts";
import { normalizeSegmentOptions } from "./segment-options.ts";
import type {
  AppearanceMixConfig,
  CustomSegmentConfig,
  CustomStatusItem,
  PowerlinePlacement,
  StatusLineLayout,
  StatusLinePreset,
  StatusLineSegmentId,
  StatusLineSegmentOptions,
  StatusLineSeparatorStyle,
} from "./types.ts";
import { isStructuralPresetName } from "./structural-presets.ts";
import { isMotionLevel, type MotionLevel } from "../motion/accessibility.ts";
import { SETTING_DEFAULTS } from "./settings-registry.ts";

export interface PowerlineConfig {
  preset: StatusLinePreset;
  customItems: CustomStatusItem[];
  disabledSegments: StatusLineSegmentId[];
  invalidDisabledSegments: string[];
  layout: StatusLineLayout | null;
  invalidLayoutSegments: string[];
  separator: StatusLineSeparatorStyle | null;
  segmentOptions: StatusLineSegmentOptions;
  placement: PowerlinePlacement;
  invalidPlacement: string | null;
  welcome: boolean;
  stashSharpSShortcut: boolean;
  /** Session cost threshold (USD) for a once-per-session warning. */
  costAlert: number | null;
  /** Auto-promote live extension status keys into `custom:<key>` segments. */
  customItemsAuto: boolean;
  queue: { captureSigil: string | false; retentionHours: number };
  /** User-defined computed segments (command/env/static), keyed by id */
  segments: Record<string, CustomSegmentConfig>;
  /** User-defined presets, keyed by name */
  presets: Record<string, import("./types.ts").CustomPresetConfig>;
  /** Per-segment custom text label shown before the value (e.g. tps -> "speed"). */
  segmentLabels: Record<string, string>;
  /** Independently mixable vNext structural appearance layers. */
  appearance: AppearanceMixConfig;
  /** Persisted motion sensitivity. Environment can still force off. */
  motionLevel: MotionLevel;
}

export function parsePowerlineConfig(
  value: unknown,
  presets: readonly StatusLinePreset[],
): PowerlineConfig {
  const defaultConfig: PowerlineConfig = {
    preset: SETTING_DEFAULTS["powerline.preset"],
    customItems: [],
    disabledSegments: [],
    invalidDisabledSegments: [],
    layout: null,
    invalidLayoutSegments: [],
    separator: null,
    segmentOptions: {},
    placement: SETTING_DEFAULTS["powerline.placement"],
    invalidPlacement: null,
    welcome: SETTING_DEFAULTS["powerline.welcome"],
    stashSharpSShortcut: false,
    costAlert: null,
    customItemsAuto: false,
    queue: { captureSigil: "#", retentionHours: 24 },
    segments: {},
    presets: {},
    segmentLabels: {},
    appearance: {},
    motionLevel: SETTING_DEFAULTS["powerline.motionLevel"],
  };

  const directPreset = normalizePreset(value, presets);
  if (directPreset) return { ...defaultConfig, preset: directPreset };

  if (!isRecord(value)) return defaultConfig;

  const customItems = normalizeCustomItems(value.customItems);
  const customSegments = normalizeCustomSegments(value.segments);
  const customSegmentIds = new Set(Object.keys(customSegments));
  const { disabledSegments, invalidDisabledSegments } =
    normalizeDisabledSegments(
      value.disabledSegments,
      customItems,
      customSegmentIds,
    );
  const { layout, invalidLayoutSegments } = normalizeLayout(
    value.layout,
    customItems,
    customSegmentIds,
  );
  const { placement, invalidPlacement } = normalizePlacement(value.placement);
  const queue = isRecord(value.queue)
    ? {
        captureSigil: normalizeCaptureSigil(value.queue.captureSigil),
        retentionHours: normalizeRetentionHours(value.queue.retentionHours),
      }
    : defaultConfig.queue;
  const customItemIds = new Set(customItems.map((item) => item.id));
  const customPresetDefs = normalizeCustomPresets(
    value.presets,
    customItemIds,
    customSegmentIds,
  );
  const requestedPreset =
    typeof value.preset === "string" ? value.preset.trim().toLowerCase() : "";
  const preset =
    normalizePreset(value.preset, presets) ??
    (Object.prototype.hasOwnProperty.call(customPresetDefs, requestedPreset)
      ? (requestedPreset as StatusLinePreset)
      : defaultConfig.preset);

  return {
    preset,
    customItems,
    disabledSegments,
    invalidDisabledSegments,
    layout,
    invalidLayoutSegments,
    separator: normalizeSeparator(value.separator),
    segmentOptions: normalizeSegmentOptions(value),
    placement,
    invalidPlacement,
    welcome:
      typeof value.welcome === "boolean"
        ? value.welcome
        : SETTING_DEFAULTS["powerline.welcome"],
    stashSharpSShortcut: value.stashSharpSShortcut === true,
    costAlert: normalizeCostAlert(value.costAlert),
    customItemsAuto:
      normalizeCustomItemsAuto(value.customItems) ||
      value.customItemsAuto === true,
    queue,
    segments: customSegments,
    presets: customPresetDefs,
    segmentLabels: normalizeSegmentLabels(value.segmentLabels),
    appearance: normalizeAppearance(value.appearance),
    motionLevel: isMotionLevel(value.motionLevel)
      ? value.motionLevel
      : SETTING_DEFAULTS["powerline.motionLevel"],
  };
}

function normalizeAppearance(value: unknown): AppearanceMixConfig {
  if (!isRecord(value)) return {};
  const result: AppearanceMixConfig = {};
  const presetKeys = [
    "base",
    "palette",
    "signalLayout",
    "chrome",
    "glyphs",
    "deck",
    "welcome",
  ] as const;
  for (const key of presetKeys) {
    const candidate = value[key];
    if (typeof candidate === "string" && isStructuralPresetName(candidate)) {
      result[key] = candidate;
    }
  }
  if (typeof value.motion === "string" && isStructuralPresetName(value.motion)) {
    result.motion = value.motion;
  } else if (isRecord(value.motion)) {
    const refs: Record<string, string> = {};
    for (const [event, ref] of Object.entries(value.motion)) {
      if (typeof ref === "string" && ref.trim()) refs[event] = ref.trim();
    }
    result.motion = refs as AppearanceMixConfig["motion"];
  }
  return result;
}
