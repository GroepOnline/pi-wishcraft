/**
 * Canonical metadata for settings exposed by Wishcraft.
 *
 * Keep defaults, edit kinds, choices, grouping and operator copy here. Runtime
 * parsers may consume the same defaults without depending on the TUI layer.
 */
import { tr } from "../i18n/index.ts";
import { MOTION_LEVELS } from "../motion/accessibility.ts";
import { STRUCTURAL_PRESET_NAMES } from "./types.ts";

export type SettingValue = boolean | string | number;
export type SettingKind = "toggle" | "select" | "text" | "number";
export type SettingGroupId =
  | "status"
  | "vibes"
  | "skills"
  | "harness"
  | "shortcuts"
  | "shell"
  | "interface";

interface SettingDefinitionBase {
  id: string;
  path: string;
  group: SettingGroupId;
  label: string;
  hint?: string;
  description?: string;
  restartRequired?: boolean;
  /** Inclusive lower bound for `kind: "number"`. */
  min?: number;
  /** Inclusive upper bound for `kind: "number"`. */
  max?: number;
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
  "wishcraft.workingIndicatorStyle": "dots",
} as const satisfies Record<string, SettingValue>;

export const SETTING_GROUPS = [
  { id: "status", title: "Status bar" },
  { id: "vibes", title: "Welcome & vibes" },
  { id: "skills", title: "Skills" },
  { id: "harness", title: "Hooks & repairs (harness)" },
  { id: "shortcuts", title: "Shortcuts" },
  { id: "shell", title: "Shell & bash mode" },
  { id: "interface", title: "Interface" },
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
  { id: "status.path.maxLength", path: "powerline.segmentOptions.path.maxLength", group: "status", label: "Path max length", kind: "number", min: 0, hint: "0 = unlimited" },
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
  { id: "status.tps.windowMs", path: "powerline.segmentOptions.tps.windowMs", group: "status", label: "TPS window (ms)", kind: "number", min: 0, defaultValue: SETTING_DEFAULTS["powerline.segmentOptions.tps.windowMs"], hint: "default 1000" },
  { id: "status.tps.mode", path: "powerline.segmentOptions.tps.mode", group: "status", label: "TPS mode", kind: "select", choices: ["both", "out", "in"] },
  { id: "status.tps.label", path: "powerline.segmentLabels.tps", group: "status", label: "TPS label", kind: "text", hint: "empty = no label" },
  { id: "status.cost.alert", path: "powerline.costAlert", group: "status", label: "Cost alert", kind: "number", min: 0, hint: "USD per session · warns once · 0 = off" },
  { id: "status.stashSharpS", path: "powerline.stashSharpSShortcut", group: "status", label: "Stash on printable ß", kind: "toggle", hint: "off = ß types normally" },
  { id: "status.customItemsAuto", path: "powerline.customItemsAuto", group: "status", label: "Auto-promote extension statuses", kind: "toggle", hint: "live extension status keys become segments" },
  { id: "status.queue.retention", path: "powerline.queue.retentionHours", group: "status", label: "Idea retention (hours)", kind: "number", min: 1, max: 8760, hint: "1–8760 · default 24" },
  { id: "status.git.branch", path: "powerline.segmentOptions.git.showBranch", group: "status", label: "Git branch", kind: "toggle" },
  { id: "status.git.staged", path: "powerline.segmentOptions.git.showStaged", group: "status", label: "Git staged count", kind: "toggle" },
  { id: "status.git.unstaged", path: "powerline.segmentOptions.git.showUnstaged", group: "status", label: "Git unstaged count", kind: "toggle" },
  { id: "status.git.untracked", path: "powerline.segmentOptions.git.showUntracked", group: "status", label: "Git untracked count", kind: "toggle" },
  { id: "status.git.polling", path: "powerline.segmentOptions.git.polling", group: "status", label: "Git polling", kind: "select", choices: ["full", "branch", "off"], hint: "full = status on every refresh · off = cheapest" },
  { id: "status.git.commitLength", path: "powerline.segmentOptions.git.maxCommitSubjectLength", group: "status", label: "Commit subject max", kind: "number", min: 0, hint: "0 = no limit · default 24" },
  { id: "status.model.thinking", path: "powerline.segmentOptions.model.showThinkingLevel", group: "status", label: "Show thinking level", kind: "toggle" },
  { id: "status.model.display", path: "powerline.segmentOptions.model.display", group: "status", label: "Model name style", kind: "select", choices: ["name", "qualified"] },
  { id: "status.ports.host", path: "powerline.segmentOptions.openPorts.host", group: "status", label: "Ports probe host", kind: "text", hint: "SSH host to probe (fleet) · empty = this machine" },
  { id: "welcome.enabled", path: "powerline.welcome", group: "vibes", label: "Welcome overlay", kind: "toggle", defaultValue: SETTING_DEFAULTS["powerline.welcome"], hint: "on = overlay at startup, off = no welcome" },
  { id: "welcome.lanternMotion", path: "wishcraft.welcome.animateLantern", group: "vibes", label: "Animate wishcraft lantern", kind: "toggle", hint: "flicker on the lantern" },
  { id: "vibes.indicatorStyle", path: "wishcraft.workingIndicatorStyle", group: "vibes", label: "Working indicator", kind: "select", choices: ["dots", "pulse", "bar", "ascii"], defaultValue: SETTING_DEFAULTS["wishcraft.workingIndicatorStyle"], hint: "frame style used while the agent is working" },
  { id: "skills.inline", path: "wishcraft.inlineSkills", group: "skills", label: "Inline expand /command and $skill", kind: "toggle", hint: "needs a restart to take effect", restartRequired: true },
  { id: "skills.readHints", path: "wishcraft.readHints", group: "skills", label: "Read hints", kind: "toggle", defaultValue: SETTING_DEFAULTS["wishcraft.readHints"], hint: "off = no continuation hint after partial reads" },
  { id: "harness.hooks", path: "wishcraft.hooksEnabled", group: "harness", label: "Hooks enabled", kind: "toggle", defaultValue: SETTING_DEFAULTS["wishcraft.hooksEnabled"], hint: "gate for configured preToolUse / postToolUse / sessionStart hooks" },
  { id: "harness.repairs", path: "wishcraft.repairsEnabled", group: "harness", label: "Tool-input repairs", kind: "toggle", defaultValue: SETTING_DEFAULTS["wishcraft.repairsEnabled"], hint: "null-for-optional, auto-link, json-array, path aliases" },
  { id: "harness.policy", path: "wishcraft.policyEnabled", group: "harness", label: "Policy engine", kind: "toggle", hint: "gate for wishcraft.policy deny/inject rules" },
  { id: "budget.dailyTokens", path: "wishcraft.tokenBudget.daily", group: "harness", label: "Daily token budget", kind: "number", min: 0, hint: "colours the cost segment; never blocks. 0 = off" },
  { id: "shortcut.menu", path: "powerlineShortcuts.menu", group: "shortcuts", label: "Menu", kind: "text", hint: "e.g. alt+p" },
  { id: "shortcut.info", path: "powerlineShortcuts.info", group: "shortcuts", label: "Info", kind: "text" },
  { id: "shortcut.stash", path: "powerlineShortcuts.stashHistory", group: "shortcuts", label: "Stash", kind: "text" },
  { id: "shortcut.idea", path: "powerlineShortcuts.ideaCapture", group: "shortcuts", label: "Idea", kind: "text" },
  { id: "shortcut.queue", path: "powerlineShortcuts.queueOpen", group: "shortcuts", label: "Queue", kind: "text" },
  { id: "shortcut.copy", path: "powerlineShortcuts.copyEditor", group: "shortcuts", label: "Copy editor text", kind: "text", hint: "applied after /reload" },
  { id: "shortcut.cut", path: "powerlineShortcuts.cutEditor", group: "shortcuts", label: "Cut editor text", kind: "text", hint: "applied after /reload" },
  { id: "shortcut.editorStart", path: "powerlineShortcuts.editorStart", group: "shortcuts", label: "Editor cursor start", kind: "text", hint: "applied after /reload" },
  { id: "shortcut.editorEnd", path: "powerlineShortcuts.editorEnd", group: "shortcuts", label: "Editor cursor end", kind: "text", hint: "applied after /reload" },
  { id: "shell.toggleShortcut", path: "bashMode.toggleShortcut", group: "shell", label: "Bash mode toggle", kind: "text", hint: "e.g. ctrl+shift+b · empty = disabled · next session" },
  { id: "shell.transcriptLines", path: "bashMode.transcriptMaxLines", group: "shell", label: "Transcript max lines", kind: "number", min: 100, hint: "min 100 · default 2000" },
  { id: "shell.transcriptBytes", path: "bashMode.transcriptMaxBytes", group: "shell", label: "Transcript max bytes", kind: "number", min: 16384, hint: "min 16 KiB · default 512 KiB" },
  { id: "shell.initScript", path: "bashMode.initScript", group: "shell", label: "Shell init script", kind: "text", hint: "run when a bash session starts · empty = none" },
  { id: "interface.language", path: "wishcraft.locale", group: "interface", label: "Language", kind: "select", choices: ["en", "nl"], defaultValue: "en", hint: "UI language · applies immediately, no restart" },
] as const satisfies readonly SettingDefinition[];

const SETTINGS_BY_PATH = new Map<string, SettingDefinition>(SETTINGS_REGISTRY.map((item) => [item.path, item]));
const SETTINGS_BY_ID = new Map<string, SettingDefinition>(SETTINGS_REGISTRY.map((item) => [item.id, item]));

export function getSettingDefinition(pathOrId: string): SettingDefinition | undefined {
  return SETTINGS_BY_PATH.get(pathOrId) ?? SETTINGS_BY_ID.get(pathOrId);
}

// ---------------------------------------------------------------------------
// Operator-facing copy
// ---------------------------------------------------------------------------

/** Localised label for a setting; falls back to the registry's English. */
export function settingLabel(definition: SettingDefinition): string {
  return tr(`setting.${definition.id}.label`, definition.label);
}

/** Localised hint, or `undefined` when the setting has none. */
export function settingHint(definition: SettingDefinition): string | undefined {
  return definition.hint === undefined
    ? undefined
    : tr(`setting.${definition.id}.hint`, definition.hint);
}

/** Localised group title. */
export function settingGroupTitle(group: SettingGroupDefinition): string {
  return tr(`group.${group.id}`, group.title);
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
  return explainSettingValue(definition, value).ok;
}

/** What kind of value the setting rejects, for error copy and repair. */
export type SettingProblemKind = "choice" | "number" | "boolean" | "text" | "range";

export type SettingValidation =
  | { ok: true }
  | {
      ok: false;
      kind: SettingProblemKind;
      given: unknown;
      /** Allowed choices for `"choice"`, otherwise `null`. */
      choices: readonly string[] | null;
      min?: number;
      max?: number;
    };

/**
 * Validate with a reason attached, so callers can say *why* a stored value was
 * rejected and what to do about it instead of silently reverting to default.
 */
export function explainSettingValue(
  definition: SettingDefinition,
  value: unknown,
): SettingValidation {
  if (definition.kind === "toggle") {
    if (typeof value === "boolean") return { ok: true };
    return { ok: false, kind: "boolean", given: value, choices: null };
  }
  if (definition.kind === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return { ok: false, kind: "number", given: value, choices: null };
    }
    if (definition.min !== undefined && value < definition.min) {
      return { ok: false, kind: "range", given: value, choices: null, min: definition.min, max: definition.max };
    }
    if (definition.max !== undefined && value > definition.max) {
      return { ok: false, kind: "range", given: value, choices: null, min: definition.min, max: definition.max };
    }
    return { ok: true };
  }
  if (definition.kind === "text") {
    if (typeof value === "string") return { ok: true };
    return { ok: false, kind: "text", given: value, choices: null };
  }
  if (typeof value !== "string") {
    return { ok: false, kind: "choice", given: value, choices: definition.choices };
  }
  if (definition.choices.includes(value)) return { ok: true };
  return { ok: false, kind: "choice", given: value, choices: definition.choices };
}

function describeGiven(value: unknown): string {
  if (value === undefined) return "(unset)";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? typeof value;
  } catch {
    return typeof value;
  }
}

/**
 * Human-readable, localised explanation of why `value` is unusable and which
 * value applies instead. Returns `null` when the stored value is valid.
 */
export function validationProblem(
  definition: SettingDefinition,
  value: unknown,
  fallback: SettingValue | null,
): string | null {
  const result = explainSettingValue(definition, value);
  if (result.ok) return null;
  const label = settingLabel(definition);
  const given = describeGiven(value);

  let message: string;
  if (result.kind === "choice") {
    message = tr(
      `validation.select`,
      '"{label}" expects one of: {choices}. Given: "{given}".',
      { label, choices: (result.choices ?? []).join(" · "), given },
    );
  } else if (result.kind === "range") {
    const bounds =
      result.min !== undefined && result.max !== undefined
        ? `${result.min}–${result.max}`
        : result.min !== undefined
          ? `>= ${result.min}`
          : `<= ${result.max}`;
    message = tr(
      `validation.number`,
      '"{label}" expects a number in {bounds}. Given: {given}.',
      { label, bounds, given },
    );
  } else if (result.kind === "number") {
    message = tr(`validation.number`, '"{label}" expects a number. Given: {given}.', {
      label,
      bounds: "any number",
      given,
    });
  } else if (result.kind === "boolean") {
    message = tr(
      `validation.boolean`,
      '"{label}" is a toggle: use on/off, not "{given}".',
      { label, given },
    );
  } else {
    message = tr(`validation.text`, '"{label}" expects text. Given: {kind}.', {
      label,
      kind: describeGiven(value),
    });
  }

  return fallback === null
    ? message
    : `${message} ${tr("validation.defaultValue", "Using default: {value}.", { value: String(fallback) })}`;
}
