import type { ColorScheme, PresetDef, StatusLinePreset } from "./types.ts";
import { getDefaultColors } from "../theme/theme.ts";
import type { CustomPresetConfig } from "./types.ts";
import { createTokens, deriveColorSchemeFromTokens } from "../theme/tokens/mapping.ts";

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

// chef-calm: same operational essentials, visually quieter. Accent stays
// reserved for state (context/token states), everything else blends into
// text/dim so the line reads as one row instead of a rainbow.
const CHEF_CALM_COLORS: ColorScheme = {
  ...DEFAULT_COLORS,
  model: "text",
  path: "text",
  gitClean: "dim",
  queue: "dim",
  context: "accent",
};

// ---------------------------------------------------------------------------
// 10 vNext Structural Signature Presets
// ---------------------------------------------------------------------------

const LANTERNWAKE_TOKENS = createTokens({
  primary: "#f59e0b",
  accent: "#ea580c",
  surface: "#0f172a",
  surfaceRaised: "#1e293b",
  motionHot: "#fbbf24",
  motionTrail: "#78350f",
});

const THREADBOUND_TOKENS = createTokens({
  primary: "#6366f1",
  secondary: "#818cf8",
  accent: "#ec4899",
  surface: "#18181b",
  surfaceRaised: "#27272a",
  motionHot: "#a855f7",
});

const SCRYGLASS_TOKENS = createTokens({
  primary: "#06b6d4",
  secondary: "#38bdf8",
  accent: "#8b5cf6",
  surface: "#090d16",
  surfaceRaised: "#161e2e",
  motionHot: "#22d3ee",
});

const RUNEBLOOM_TOKENS = createTokens({
  primary: "#10b981",
  secondary: "#34d399",
  accent: "#eab308",
  surface: "#0c140f",
  surfaceRaised: "#19261e",
  motionHot: "#facc15",
});

const MOONWELL_TOKENS = createTokens({
  primary: "#94a3b8",
  secondary: "#cbd5e1",
  accent: "#38bdf8",
  surface: "#020617",
  surfaceRaised: "#0f172a",
  motionHot: "#e2e8f0",
});

const HEXFORGE_TOKENS = createTokens({
  primary: "#f97316",
  secondary: "#fb923c",
  accent: "#ef4444",
  surface: "#1c1917",
  surfaceRaised: "#292524",
  motionHot: "#ffedd5",
});

const VELLUM_TOKENS = createTokens({
  primary: "#d97706",
  secondary: "#b45309",
  accent: "#a16207",
  surface: "#1a1815",
  surfaceRaised: "#292520",
  motionHot: "#f59e0b",
});

const WISP_TOKENS = createTokens({
  primary: "#cbd5e1",
  secondary: "#94a3b8",
  accent: "#38bdf8",
  surface: "#0b0f19",
  surfaceRaised: "#111827",
  motionHot: "#67e8f9",
});

const STARWEAVE_TOKENS = createTokens({
  primary: "#a855f7",
  secondary: "#c084fc",
  accent: "#38bdf8",
  surface: "#050515",
  surfaceRaised: "#13112c",
  motionHot: "#f472b6",
});

const CRUCIBLE_TOKENS = createTokens({
  primary: "#ec4899",
  secondary: "#f43f5e",
  accent: "#fb7185",
  surface: "#110b11",
  surfaceRaised: "#241424",
  motionHot: "#fda4af",
});

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
        polling: "full",
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

  // chef-calm: five segments, dot separator, quiet motion. The operational
  // row without the noise — tps/open_ports/subagents/cost/hostname dropped,
  // git commit subjects off (ahead/behind stays). Colours: text/dim with a
  // single accent for context so the line reads as one calm row.
  "chef-calm": {
    leftSegments: ["model", "path", "git"],
    rightSegments: ["context_pct", "time"],
    secondarySegments: [],
    separator: "dot",
    colors: CHEF_CALM_COLORS,
    segmentOptions: {
      model: { showThinkingLevel: false },
      path: { mode: "basename" },
      git: {
        showBranch: true,
        showStaged: false,
        showUnstaged: false,
        showUntracked: false,
        polling: "branch",
        hostIcon: false,
        showAheadBehind: true,
        showCommit: false,
      },
      context: { format: "percent" },
      time: { format: "24h", showSeconds: false },
    },
    motion: {
      idle: "nimbus",
      thinking: "nimbus",
      streaming: "nimbus",
      "tool.end": "copper-switch",
      success: "copper-switch",
      error: "copper-switch",
    },
  },

  // 10 vNext Structural Presets
  lanternwake: {
    leftSegments: ["model", "thinking", "shell_mode", "path", "git", "session", "queue"],
    rightSegments: ["token_in", "token_out", "cost", "context_pct", "time_spent"],
    secondarySegments: ["extension_statuses"],
    separator: "powerline",
    colors: deriveColorSchemeFromTokens(LANTERNWAKE_TOKENS),
    tokens: LANTERNWAKE_TOKENS,
    motion: {
      streaming: "ember-relay",
      thinking: "ember-relay",
      "tool.start": "hex-relay",
      success: "rune-bloom",
    },
  },

  threadbound: {
    leftSegments: ["model", "path", "git", "queue"],
    rightSegments: ["tps", "cost", "context_pct"],
    separator: "powerline-thin",
    colors: deriveColorSchemeFromTokens(THREADBOUND_TOKENS),
    tokens: THREADBOUND_TOKENS,
  },

  scryglass: {
    leftSegments: ["model", "path", "git"],
    rightSegments: ["token_total", "cost", "context_pct"],
    separator: "chevron",
    colors: deriveColorSchemeFromTokens(SCRYGLASS_TOKENS),
    tokens: SCRYGLASS_TOKENS,
  },

  runebloom: {
    leftSegments: ["model", "git", "queue"],
    rightSegments: ["context_pct", "time_spent"],
    separator: "dot",
    colors: deriveColorSchemeFromTokens(RUNEBLOOM_TOKENS),
    tokens: RUNEBLOOM_TOKENS,
  },

  moonwell: {
    leftSegments: ["model", "thinking", "git"],
    rightSegments: ["context_pct", "time"],
    separator: "slash",
    colors: deriveColorSchemeFromTokens(MOONWELL_TOKENS),
    tokens: MOONWELL_TOKENS,
  },

  hexforge: {
    leftSegments: ["hostname", "model", "shell_mode", "git", "queue"],
    rightSegments: ["tps", "open_ports", "cost", "context_pct"],
    separator: "block",
    colors: deriveColorSchemeFromTokens(HEXFORGE_TOKENS),
    tokens: HEXFORGE_TOKENS,
  },

  vellum: {
    leftSegments: ["model", "path", "git"],
    rightSegments: ["cost", "context_pct"],
    separator: "none",
    colors: deriveColorSchemeFromTokens(VELLUM_TOKENS),
    tokens: VELLUM_TOKENS,
  },

  wisp: {
    leftSegments: ["model", "git"],
    rightSegments: ["context_pct"],
    separator: "none",
    colors: deriveColorSchemeFromTokens(WISP_TOKENS),
    tokens: WISP_TOKENS,
  },

  starweave: {
    leftSegments: ["model", "path", "git", "subagents"],
    rightSegments: ["token_in", "token_out", "context_pct"],
    separator: "star",
    colors: deriveColorSchemeFromTokens(STARWEAVE_TOKENS),
    tokens: STARWEAVE_TOKENS,
  },

  crucible: {
    leftSegments: ["model", "thinking", "shell_mode", "git"],
    rightSegments: ["tps", "cost", "context_pct"],
    separator: "block",
    colors: deriveColorSchemeFromTokens(CRUCIBLE_TOKENS),
    tokens: CRUCIBLE_TOKENS,
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
      tokens: def.tokens,
    };
    customPresets.set(name, presetDef);
  }
}

// Warn once per unknown preset name instead of silently falling back to default.
const warnedUnknownPresets = new Set<string>();

/** Resolve a preset by name, checking user-defined presets first. */
export function resolvePreset(name: string): PresetDef {
  if (
    customPresets.has(name) ||
    Object.prototype.hasOwnProperty.call(PRESETS, name)
  ) {
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
