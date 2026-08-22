import { PRESETS } from "../../config/presets.ts";
import { WELCOME_ART_THEMES } from "../../welcome/welcome-art.ts";
import { isRecord, writeSettingKey } from "./settings-io.ts";

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

/** Nested read: "wishcraft.hooksEnabled" → settings.wishcraft.hooksEnabled. */
export function readConfigPath(settings: Record<string, unknown>, path: string): ConfigValue {
  let cur: unknown = settings;
  for (const part of path.split(".")) {
    if (!isRecord(cur)) return null;
    cur = cur[part];
  }
  if (typeof cur === "boolean" || typeof cur === "string" || typeof cur === "number")
    return cur;
  return null;
}

/** True for path segments that would mutate Object.prototype. */
export function isUnsafeConfigKey(key: string): boolean {
  return key === "__proto__" || key === "constructor" || key === "prototype";
}

/**
 * Set `parts` (after the root key) on `root`. Returns false and leaves
 * `root` unchanged when a segment is `__proto__`, `constructor`, or `prototype`.
 */
export function assignNestedConfigValue(
  root: Record<string, unknown>,
  parts: string[],
  value: ConfigValue,
): boolean {
  for (const part of parts) {
    if (part === "__proto__" || part === "constructor" || part === "prototype") {
      return false;
    }
  }
  let node = root;
  for (let i = 0; i < parts.length; i++) {
    const key = parts[i]!;
    // Guard in this loop so CodeQL sees the key check next to the assignment.
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      return false;
    }
    if (i === parts.length - 1) {
      if (value === null) delete node[key];
      else node[key] = value;
    } else {
      if (!isRecord(node[key])) node[key] = {};
      node = node[key] as Record<string, unknown>;
    }
  }
  return true;
}

/** Nested write (new object per level) + persist to settings.json. */
export function writeConfigPath(
  cwd: string,
  path: string,
  value: ConfigValue,
): boolean {
  const parts = path.split(".");
  const rootKey = parts[0]!;
  if (!rootKey || parts.some(isUnsafeConfigKey)) {
    return false;
  }
  return writeSettingKey(cwd, rootKey, (existing) => {
    // Single-segment path (e.g. "quietStartup"): the root key holds the value
    // directly. null removes the key, mirroring nested-path semantics.
    if (parts.length === 1) {
      return value === null ? undefined : value;
    }
    // Shorthand string under powerline (e.g. "chef") is a preset name: keep it.
    const node: Record<string, unknown> = isRecord(existing)
      ? existing
      : rootKey === "powerline" && typeof existing === "string"
        ? { preset: existing }
        : {};
    if (!assignNestedConfigValue(node, parts.slice(1), value)) {
      return existing;
    }
    return node;
  });
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
export function buildConfigGroups(settings: Record<string, unknown>): ConfigGroup[] {
  const powerline = settings.powerline;
  const presetName = typeof powerline === "string" ? powerline : isRecord(powerline) && typeof powerline.preset === "string" ? powerline.preset : "default";
  const preset = PRESETS[presetName as keyof typeof PRESETS] ?? PRESETS.default;
  const options = preset.segmentOptions ?? {};
  const modelDefaults = isRecord(options.model) ? options.model : {};
  const gitDefaults = isRecord(options.git) ? options.git : {};
  const defaultOf = (group: Record<string, unknown>, key: string) => typeof group[key] === "boolean" ? group[key] as boolean : undefined;
  return [
    {
      title: "Status bar",
      items: [
        { label: "Preset", path: "powerline.preset", kind: "select", choices: ["default", "minimal", "compact", "full", "nerd", "ascii", "chef"] },
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
      title: "Model & git details",
      items: [
        { label: "Model display", path: "powerline.segmentOptions.model.display", kind: "select", choices: ["name", "qualified"], hint: "short name or provider/name" },
        { label: "Model thinking level", path: "powerline.segmentOptions.model.showThinkingLevel", kind: "toggle", default: defaultOf(modelDefaults, "showThinkingLevel"), hint: "show think:low/med/high next to the model" },
        { label: "Git branch", path: "powerline.segmentOptions.git.showBranch", kind: "toggle", default: defaultOf(gitDefaults, "showBranch") },
        { label: "Git staged count", path: "powerline.segmentOptions.git.showStaged", kind: "toggle", default: defaultOf(gitDefaults, "showStaged") },
        { label: "Git unstaged count", path: "powerline.segmentOptions.git.showUnstaged", kind: "toggle", default: defaultOf(gitDefaults, "showUnstaged") },
        { label: "Git untracked count", path: "powerline.segmentOptions.git.showUntracked", kind: "toggle", default: defaultOf(gitDefaults, "showUntracked") },
        { label: "Git polling", path: "powerline.segmentOptions.git.polling", kind: "select", choices: ["full", "branch", "off"], hint: "full = counts + ahead/behind, branch = name only, off = disable" },
        { label: "Git commit subject max", path: "powerline.segmentOptions.git.maxCommitSubjectLength", kind: "number", hint: "0 = default" },
      ],
    },
    {
      title: "Welcome & vibes",
      items: [
        { label: "Welcome overlay", path: "powerline.welcome", kind: "toggle", hint: "on = overlay at startup, off = no welcome" },
        { label: "Welcome art", path: "wishcraft.welcome.art", kind: "select", choices: [...WELCOME_ART_THEMES], hint: "lantern = Kongming sky lantern, balloon = wish balloon, normal = pi mark" },
        { label: "Animate wishcraft lantern", path: "wishcraft.welcome.animateLantern", kind: "toggle", hint: "flicker on the lantern flame" },
        { label: "Persistent header (quiet startup)", path: "quietStartup", kind: "toggle", hint: "on = header that dismisses on first input, off = centered overlay; needs a restart to take effect" },
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
