/**
 * Canonical metadata for settings exposed by Wishcraft.
 *
 * Keep defaults, edit kinds, choices, grouping and operator copy here. Runtime
 * parsers may consume the same defaults without depending on the TUI layer.
 */
import { MOTION_LEVELS } from "../motion/accessibility.ts";
import { STRUCTURAL_PRESET_NAMES } from "./types.ts";

export type SettingValue = boolean | string | number;
export type SettingKind = "toggle" | "select" | "text" | "number";
export type SettingGroupId = "status" | "vibes" | "skills" | "harness" | "shortcuts";

interface SettingDefinitionBase {
  id: string;
  path: string;
  group: SettingGroupId;
  label: string;
  hint?: string;
  description?: string;
  restartRequired?: boolean;
}

export type SettingDefinition =
  | (SettingDefinitionBase & { kind: "toggle"; defaultValue?: boolean })
  | (SettingDefinitionBase & { kind: "select"; choices: readonly string[]; defaultValue?: string })
  | (SettingDefinitionBase & { kind: "text"; defaultValue?: string })
  | (SettingDefinitionBase & { kind: "number"; defaultValue?: number });

export interface SettingGroupDefinition {
  id: SettingGroupId;
  title: string;
}

export const SETTING_DEFAULTS = {
  "powerline.preset": "default",
  "powerline.placement": "above",
  "powerline.welcome": true,
  "powerline.motionLevel": "full",
  "powerline.segmentOptions.tps.windowMs": 1000,
  "wishcraft.readHints": true,
  "wishcraft.hooksEnabled": true,
  "wishcraft.repairsEnabled": true,
} as const satisfies Record<string, SettingValue>;

export const SETTING_GROUPS = [
  { id: "status", title: "Status bar" },
  { id: "vibes", title: "Welcome & vibes" },
  { id: "skills", title: "Skills" },
  { id: "harness", title: "Hooks & repairs (harness)" },
  { id: "shortcuts", title: "Shortcuts" },
] as const satisfies readonly SettingGroupDefinition[];

const SEPARATORS = [
  "powerline", "powerline-thin", "slash", "pipe", "block", "none",
  "ascii", "dot", "chevron", "star",
] as const;
const STATUS_PRESETS = ["default", "minimal", "compact", "full", "nerd", "ascii", "chef"] as const;

export const SETTINGS_REGISTRY = [
  { id: "status.preset", path: "powerline.preset", group: "status", label: "Preset", kind: "select", choices: STATUS_PRESETS, defaultValue: SETTING_DEFAULTS["powerline.preset"] },
  { id: "appearance.base", path: "powerline.appearance.base", group: "status", label: "Structural base", kind: "select", choices: STRUCTURAL_PRESET_NAMES, hint: "colors and motion for Signal; layout preset stays separate" },
  { id: "motion.level", path: "powerline.motionLevel", group: "status", label: "Motion level", kind: "select", choices: MOTION_LEVELS, defaultValue: SETTING_DEFAULTS["powerline.motionLevel"], hint: "full · reduced · functional · off" },
  { id: "status.separator", path: "powerline.separator", group: "status", label: "Separator", kind: "select", choices: SEPARATORS },
  { id: "status.placement", path: "powerline.placement", group: "status", label: "Placement", kind: "select", choices: ["above", "below"], defaultValue: SETTING_DEFAULTS["powerline.placement"] },
  { id: "status.path.mode", path: "powerline.segmentOptions.path.mode", group: "status", label: "Path mode", kind: "select", choices: ["basename", "abbreviated", "full"] },
  { id: "status.path.maxLength", path: "powerline.segmentOptions.path.maxLength", group: "status", label: "Path max length", kind: "number", hint: "0 = unlimited" },
  { id: "status.time.format", path: "powerline.segmentOptions.time.format", group: "status", label: "Time format", kind: "select", choices: ["12h", "24h"] },
  { id: "status.time.seconds", path: "powerline.segmentOptions.time.showSeconds", group: "status", label: "Time seconds", kind: "toggle" },
  { id: "status.git.hostIcons", path: "powerline.segmentOptions.git.hostIcon", group: "status", label: "Git host icons", kind: "toggle" },
  { id: "status.git.aheadBehind", path: "powerline.segmentOptions.git.showAheadBehind", group: "status", label: "Git ahead/behind", kind: "toggle" },
  { id: "status.git.latestCommit", path: "powerline.segmentOptions.git.showCommit", group: "status", label: "Git latest commit", kind: "toggle" },
  { id: "status.context.format", path: "powerline.segmentOptions.context.format", group: "status", label: "Context format", kind: "select", choices: ["full", "percent"] },
  { id: "status.cacheRead.format", path: "powerline.segmentOptions.cache_read.format", group: "status", label: "Cache-read format", kind: "select", choices: ["tokens", "percent", "both"] },
  { id: "status.cost.display", path: "powerline.segmentOptions.cost.subscriptionDisplay", group: "status", label: "Cost display", kind: "select", choices: ["subscription", "reported-cost", "both"] },
  { id: "status.cost.currency", path: "powerline.segmentOptions.cost.currency", group: "status", label: "Currency", kind: "text" },
  { id: "status.ports.udp", path: "powerline.segmentOptions.openPorts.includeUdp", group: "status", label: "Ports include UDP", kind: "toggle" },
  { id: "status.tps.windowMs", path: "powerline.segmentOptions.tps.windowMs", group: "status", label: "TPS window (ms)", kind: "number", defaultValue: SETTING_DEFAULTS["powerline.segmentOptions.tps.windowMs"], hint: "default 1000" },
  { id: "status.tps.mode", path: "powerline.segmentOptions.tps.mode", group: "status", label: "TPS mode", kind: "select", choices: ["both", "out", "in"] },
  { id: "status.tps.label", path: "powerline.segmentLabels.tps", group: "status", label: "TPS label", kind: "text", hint: "empty = no label" },
  { id: "welcome.enabled", path: "powerline.welcome", group: "vibes", label: "Welcome overlay", kind: "toggle", defaultValue: SETTING_DEFAULTS["powerline.welcome"], hint: "on = overlay at startup, off = no welcome" },
  { id: "welcome.lanternMotion", path: "wishcraft.welcome.animateLantern", group: "vibes", label: "Animate wishcraft lantern", kind: "toggle", hint: "flicker on the lantern" },
  { id: "skills.inline", path: "wishcraft.inlineSkills", group: "skills", label: "Inline expand /command and $skill", kind: "toggle", hint: "needs a restart to take effect", restartRequired: true },
  { id: "skills.readHints", path: "wishcraft.readHints", group: "skills", label: "Read hints", kind: "toggle", defaultValue: SETTING_DEFAULTS["wishcraft.readHints"], hint: "off = no continuation hint after partial reads" },
  { id: "harness.hooks", path: "wishcraft.hooksEnabled", group: "harness", label: "Hooks enabled", kind: "toggle", defaultValue: SETTING_DEFAULTS["wishcraft.hooksEnabled"], hint: "gate for configured preToolUse / postToolUse / sessionStart hooks" },
  { id: "harness.repairs", path: "wishcraft.repairsEnabled", group: "harness", label: "Tool-input repairs", kind: "toggle", defaultValue: SETTING_DEFAULTS["wishcraft.repairsEnabled"], hint: "null-for-optional, auto-link, json-array, path aliases" },
  { id: "budget.dailyTokens", path: "wishcraft.tokenBudget.daily", group: "harness", label: "Daily token budget", kind: "number", hint: "colours the cost segment; never blocks. 0 = off" },
  { id: "shortcut.menu", path: "powerlineShortcuts.menu", group: "shortcuts", label: "Menu", kind: "text", hint: "e.g. alt+p" },
  { id: "shortcut.info", path: "powerlineShortcuts.info", group: "shortcuts", label: "Info", kind: "text" },
  { id: "shortcut.stash", path: "powerlineShortcuts.stashHistory", group: "shortcuts", label: "Stash", kind: "text" },
  { id: "shortcut.idea", path: "powerlineShortcuts.ideaCapture", group: "shortcuts", label: "Idea", kind: "text" },
  { id: "shortcut.queue", path: "powerlineShortcuts.queueOpen", group: "shortcuts", label: "Queue", kind: "text" },
] as const satisfies readonly SettingDefinition[];

const SETTINGS_BY_PATH = new Map<string, SettingDefinition>(SETTINGS_REGISTRY.map((item) => [item.path, item]));
const SETTINGS_BY_ID = new Map<string, SettingDefinition>(SETTINGS_REGISTRY.map((item) => [item.id, item]));

export function getSettingDefinition(pathOrId: string): SettingDefinition | undefined {
  return SETTINGS_BY_PATH.get(pathOrId) ?? SETTINGS_BY_ID.get(pathOrId);
}

export function effectiveSettingValue(
  definition: SettingDefinition,
  storedValue: unknown,
): SettingValue | null {
  if (validateSettingValue(definition, storedValue)) return storedValue;
  return definition.defaultValue ?? null;
}

export function validateSettingValue(
  definition: SettingDefinition,
  value: unknown,
): value is SettingValue {
  if (definition.kind === "toggle") return typeof value === "boolean";
  if (definition.kind === "number") return typeof value === "number" && Number.isFinite(value);
  if (definition.kind === "text") return typeof value === "string";
  return typeof value === "string" && definition.choices.includes(value);
}
