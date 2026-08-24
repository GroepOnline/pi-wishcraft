/**
 * Declarative groups for `/wishcraft settings`.
 * Kept beside the overlay so the TUI file stays under the size budget.
 */

import { STRUCTURAL_PRESET_NAMES } from "../../config/types.ts";
import { MOTION_LEVELS } from "../../motion/accessibility.ts";

export type ConfigValue = boolean | string | number | null;

export interface ConfigItem {
  /** Label in the list. */
  label: string;
  /** Path inside settings ("powerline.placement", "wishcraft.hooksEnabled", ...). */
  path: string;
  /** Edit kind. */
  kind: "toggle" | "select" | "text" | "number";
  /** For select: the choices. */
  choices?: string[];
  /** Hint under the group. */
  hint?: string;
  /** Detail explanation (optional). */
  description?: string;
  /** Effective value when the setting is absent (toggles only; defaults to false). */
  default?: boolean;
}

export interface ConfigGroup {
  title: string;
  items: ConfigItem[];
}

const SEPARATORS = [
  "powerline",
  "powerline-thin",
  "slash",
  "pipe",
  "block",
  "none",
  "ascii",
  "dot",
  "chevron",
  "star",
];

/** Build groups from current settings (values shown live). */
export function buildConfigGroups(_settings: Record<string, unknown>): ConfigGroup[] {
  return [
    {
      title: "Status bar",
      items: [
        { label: "Preset", path: "powerline.preset", kind: "select", choices: ["default", "minimal", "compact", "full", "nerd", "ascii", "chef"] },
        {
          label: "Structural base",
          path: "powerline.appearance.base",
          kind: "select",
          choices: [...STRUCTURAL_PRESET_NAMES],
          hint: "colors and motion for Signal; layout preset stays separate",
        },
        {
          label: "Motion level",
          path: "powerline.motionLevel",
          kind: "select",
          choices: [...MOTION_LEVELS],
          hint: "full · reduced · functional · off",
        },
        { label: "Separator", path: "powerline.separator", kind: "select", choices: SEPARATORS },
        { label: "Placement", path: "powerline.placement", kind: "select", choices: ["above", "below"] },
        { label: "Path mode", path: "powerline.segmentOptions.path.mode", kind: "select", choices: ["basename", "abbreviated", "full"] },
        { label: "Path max length", path: "powerline.segmentOptions.path.maxLength", kind: "number", hint: "0 = unlimited" },
        { label: "Time format", path: "powerline.segmentOptions.time.format", kind: "select", choices: ["12h", "24h"] },
        { label: "Time seconds", path: "powerline.segmentOptions.time.showSeconds", kind: "toggle" },
        { label: "Git host icons", path: "powerline.segmentOptions.git.hostIcon", kind: "toggle" },
        { label: "Git ahead/behind", path: "powerline.segmentOptions.git.showAheadBehind", kind: "toggle" },
        { label: "Git latest commit", path: "powerline.segmentOptions.git.showCommit", kind: "toggle" },
        { label: "Context format", path: "powerline.segmentOptions.context.format", kind: "select", choices: ["full", "percent"] },
        { label: "Cache-read format", path: "powerline.segmentOptions.cache_read.format", kind: "select", choices: ["tokens", "percent", "both"] },
        { label: "Cost display", path: "powerline.segmentOptions.cost.subscriptionDisplay", kind: "select", choices: ["subscription", "reported-cost", "both"] },
        { label: "Currency", path: "powerline.segmentOptions.cost.currency", kind: "text" },
        { label: "Ports include UDP", path: "powerline.segmentOptions.openPorts.includeUdp", kind: "toggle" },
        { label: "TPS window (ms)", path: "powerline.segmentOptions.tps.windowMs", kind: "number", hint: "default 1000" },
        { label: "TPS mode", path: "powerline.segmentOptions.tps.mode", kind: "select", choices: ["both", "out", "in"] },
        { label: "TPS label", path: "powerline.segmentLabels.tps", kind: "text", hint: "empty = no label" },
      ],
    },
    {
      title: "Welcome & vibes",
      items: [
        { label: "Welcome overlay", path: "powerline.welcome", kind: "toggle", hint: "on = overlay at startup, off = no welcome" },
        { label: "Animate wishcraft lantern", path: "wishcraft.welcome.animateLantern", kind: "toggle", hint: "flicker on the lantern" },
      ],
    },
    {
      title: "Skills",
      items: [
        { label: "Inline expand /command and $skill", path: "wishcraft.inlineSkills", kind: "toggle", hint: "needs a restart to take effect" },
        { label: "Read hints", path: "wishcraft.readHints", kind: "toggle", default: true, hint: "off = no continuation hint after partial reads" },
      ],
    },
    {
      title: "Hooks & repairs (harness)",
      items: [
        { label: "Hooks enabled", path: "wishcraft.hooksEnabled", kind: "toggle", hint: "preToolUse / postToolUse / sessionStart command hooks" },
        { label: "Tool-input repairs", path: "wishcraft.repairsEnabled", kind: "toggle", hint: "null-for-optional, auto-link, json-array, path aliases" },
        { label: "Daily token budget", path: "wishcraft.tokenBudget.daily", kind: "number", hint: "colours the cost segment; never blocks. 0 = off" },
      ],
    },
    {
      title: "Shortcuts",
      items: [
        { label: "Menu", path: "powerlineShortcuts.menu", kind: "text", hint: "e.g. alt+p" },
        { label: "Info", path: "powerlineShortcuts.info", kind: "text" },
        { label: "Stash", path: "powerlineShortcuts.stashHistory", kind: "text" },
        { label: "Idea", path: "powerlineShortcuts.ideaCapture", kind: "text" },
        { label: "Queue", path: "powerlineShortcuts.queueOpen", kind: "text" },
      ],
    },
  ];
}
