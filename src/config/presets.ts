import type { ColorScheme, PresetDef, StatusLinePreset } from "./types.ts";
import { getDefaultColors } from "../theme/theme.ts";
import type { CustomPresetConfig } from "./types.ts";

// Get base colors from theme.ts (single source of truth)
const DEFAULT_COLORS: ColorScheme = getDefaultColors();

// Minimal - more muted, less colorful
const MINIMAL_COLORS: ColorScheme = {
  ...DEFAULT_COLORS,
  model: "text",
  path: "text",
  gitClean: "dim",
};

// Nerd - vibrant colors
const NERD_COLORS: ColorScheme = {
  ...DEFAULT_COLORS,
  model: "accent",
  path: "success",
  tokens: "muted",
  cost: "warning",
};

const CHEF_COLORS: ColorScheme = {
  ...DEFAULT_COLORS,
  model: "text",
  path: "text",
  gitClean: "dim",
  queue: "dim",
};

export const PRESETS: Record<StatusLinePreset, PresetDef> = {
  // v2 preset lineup — an explicit information ladder:
  //   minimal (branch only) → compact (+ short commit) → default (full git,
  //   tokens, cost, extension-statuses row) → full (host, clock, totals) →
  //   nerd (maximum, qualified model, seconds) → ascii (no Nerd Font fallback) →
  //   chef (GroepOnline ops: live TPS in/out, open ports, subagent cost).
  // Git extras (latest commit, upstream ahead/behind, host icon) are on by
  // default wherever meaningful and listed explicitly per preset.
  default: {
    leftSegments: [
      "model",
      "thinking",
      "shell_mode",
      "path",
      "git",
      "session",
      "queue",
      "subagents",
    ],
    rightSegments: [
      "token_in",
      "token_out",
      "cache_read",
      "cost",
      "context_pct",
      "time_spent",
    ],
    secondarySegments: ["extension_statuses"],
    separator: "powerline-thin",
    colors: DEFAULT_COLORS,
    segmentOptions: {
      model: { showThinkingLevel: false },
      path: { mode: "basename" },
      git: {
        showBranch: true,
        showStaged: true,
        showUnstaged: true,
        showUntracked: true,
        polling: "full",
        hostIcon: true,
        showAheadBehind: true,
        showCommit: true,
        maxCommitSubjectLength: 24,
      },
      context: { format: "full" },
      cache_read: { format: "both" },
      cost: { subscriptionDisplay: "both" },
      time: { format: "24h", showSeconds: false },
    },
  },

  minimal: {
    leftSegments: ["shell_mode", "path", "git"],
    rightSegments: ["context_pct"],
    separator: "slash",
    colors: MINIMAL_COLORS,
    segmentOptions: {
      path: { mode: "basename" },
      git: {
        showBranch: true,
        showStaged: false,
        showUnstaged: false,
        showUntracked: false,
        polling: "branch",
        hostIcon: false,
        showAheadBehind: false,
        showCommit: false,
      },
      context: { format: "percent" },
    },
  },

  compact: {
    leftSegments: ["model", "shell_mode", "git"],
    rightSegments: ["queue", "cost", "context_pct", "session"],
    separator: "powerline-thin",
    colors: DEFAULT_COLORS,
    segmentOptions: {
      model: { showThinkingLevel: true },
      git: {
        showBranch: true,
        showStaged: false,
        showUnstaged: false,
        showUntracked: false,
        polling: "branch",
        hostIcon: true,
        showAheadBehind: true,
        showCommit: true,
        maxCommitSubjectLength: 12,
      },
      context: { format: "percent" },
      cost: { subscriptionDisplay: "both" },
    },
  },

  full: {
    leftSegments: [
      "hostname",
      "model",
      "thinking",
      "shell_mode",
      "path",
      "git",
      "session",
      "queue",
      "subagents",
    ],
    rightSegments: [
      "token_total",
      "cache_read",
      "cache_write",
      "cost",
      "context_pct",
      "context_total",
      "time_spent",
      "time",
      "extension_statuses",
    ],
    separator: "powerline",
    colors: DEFAULT_COLORS,
    segmentOptions: {
      model: { showThinkingLevel: false },
      path: { mode: "abbreviated", maxLength: 50 },
      git: {
        showBranch: true,
        showStaged: true,
        showUnstaged: true,
        showUntracked: true,
        polling: "full",
        hostIcon: true,
        showAheadBehind: true,
        showCommit: true,
        maxCommitSubjectLength: 28,
      },
      context: { format: "full" },
      cache_read: { format: "both" },
      cost: { subscriptionDisplay: "both" },
      time: { format: "24h", showSeconds: true },
    },
  },

  nerd: {
    leftSegments: [
      "hostname",
      "model",
      "thinking",
      "shell_mode",
      "path",
      "git",
      "session",
      "queue",
      "subagents",
    ],
    rightSegments: [
      "token_in",
      "token_out",
      "token_total",
      "cache_read",
      "cache_write",
      "cost",
      "context_pct",
      "context_total",
      "time_spent",
      "time",
      "extension_statuses",
    ],
    separator: "powerline",
    colors: NERD_COLORS,
    segmentOptions: {
      model: { showThinkingLevel: false, display: "qualified" },
      path: { mode: "abbreviated", maxLength: 60 },
      git: {
        showBranch: true,
        showStaged: true,
        showUnstaged: true,
        showUntracked: true,
        polling: "full",
        hostIcon: true,
        showAheadBehind: true,
        showCommit: true,
        maxCommitSubjectLength: 32,
      },
      context: { format: "full" },
      cache_read: { format: "both" },
      cost: { subscriptionDisplay: "both" },
      time: { format: "24h", showSeconds: true },
    },
  },

  ascii: {
    leftSegments: ["model", "shell_mode", "path", "git", "queue"],
    rightSegments: ["token_total", "cost", "context_pct"],
    separator: "ascii",
    colors: MINIMAL_COLORS,
    segmentOptions: {
      model: { showThinkingLevel: true },
      path: { mode: "abbreviated", maxLength: 40 },
      git: {
        showBranch: true,
        showStaged: true,
        showUnstaged: true,
        showUntracked: true,
        polling: "full",
        hostIcon: false,
        showAheadBehind: true,
        showCommit: true,
        maxCommitSubjectLength: 20,
      },
      context: { format: "percent" },
      cost: { subscriptionDisplay: "both" },
    },
  },

  chef: {
    leftSegments: [
      "hostname",
      "model",
      "thinking",
      "shell_mode",
      "path",
      "git",
      "queue",
    ],
    rightSegments: ["tps", "open_ports", "subagents", "cost", "context_pct", "time"],
    separator: "slash",
    colors: CHEF_COLORS,
    segmentOptions: {
      model: { showThinkingLevel: false },
      path: { mode: "basename" },
      git: {
        showBranch: true,
        showStaged: true,
        showUnstaged: true,
        showUntracked: true,
        polling: "full",
        hostIcon: true,
        showAheadBehind: true,
        showCommit: true,
        maxCommitSubjectLength: 24,
      },
      context: { format: "percent" },
      cost: { subscriptionDisplay: "both" },
      time: { format: "24h", showSeconds: false },
      openPorts: { includeUdp: false },
    },
  },
};

export function getPreset(name: string): PresetDef {
  return resolvePreset(name);
}

// User-defined presets (settings), merged over built-ins at config time.
const customPresets = new Map<string, PresetDef>();

/** Register user-defined presets from settings. Replaces any previously registered. */
export function registerCustomPresets(
  defs: Record<string, CustomPresetConfig>,
): void {
  customPresets.clear();
  for (const [name, def] of Object.entries(defs)) {
    const presetDef: PresetDef = {
      leftSegments: def.left ?? [],
      rightSegments: def.right ?? [],
      secondarySegments: def.secondary,
      separator: def.separator ?? "slash",
      segmentOptions: def.segmentOptions,
      colors: def.colors,
    };
    customPresets.set(name, presetDef);
  }
}

// Warn once per unknown preset name instead of silently falling back to default.
const warnedUnknownPresets = new Set<string>();

/** Resolve a preset by name, checking user-defined presets first. */
export function resolvePreset(name: string): PresetDef {
  if (customPresets.has(name) || name in PRESETS) {
    return (
      customPresets.get(name) ??
      (PRESETS[name as StatusLinePreset] ?? PRESETS.default)
    );
  }
  if (!warnedUnknownPresets.has(name)) {
    warnedUnknownPresets.add(name);
    console.warn(
      `[wishcraft] Unknown powerline preset "${name}" — falling back to "default".`,
    );
  }
  return PRESETS.default;
}
