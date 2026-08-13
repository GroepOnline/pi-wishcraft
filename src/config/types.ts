import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import type { CostCurrencyCode } from "../usage/rates.ts";

// Theme color - either a pi theme color name or a custom hex color
export type ColorValue = ThemeColor | `#${string}`;
export type ThemeLike = Pick<Theme, "fg">;

// Semantic color names for segments
export type SemanticColor =
  | "model"
  | "shellMode"
  | "path"
  | "gitDirty"
  | "gitClean"
  | "thinking"
  | "thinkingMinimal"
  | "thinkingLow"
  | "thinkingMedium"
  | "context"
  | "contextWarn"
  | "contextError"
  | "cost"
  | "tokens"
  | "queue"
  | "separator"
  | "border";

// Color scheme mapping semantic names to actual colors
export type ColorScheme = Partial<Record<SemanticColor, ColorValue>>;

// Built-in segment identifiers
export const BUILTIN_STATUS_LINE_SEGMENT_IDS = [
  "model",
  "shell_mode",
  "path",
  "git",
  "subagents",
  "queue",
  "token_in",
  "token_out",
  "token_total",
  "cost",
  "context_pct",
  "context_total",
  "time_spent",
  "time",
  "session",
  "hostname",
  "cache_read",
  "cache_write",
  "thinking",
  "tps",
  "open_ports",
  "extension_statuses",
] as const;

export type BuiltinStatusLineSegmentId =
  (typeof BUILTIN_STATUS_LINE_SEGMENT_IDS)[number];

// Segment identifiers (built-in + dynamically registered custom items)
export type StatusLineSegmentId =
  BuiltinStatusLineSegmentId | `custom:${string}`;

// Separator styles
export type StatusLineSeparatorStyle =
  | "powerline"
  | "powerline-thin"
  | "slash"
  | "pipe"
  | "block"
  | "none"
  | "ascii"
  | "dot"
  | "chevron"
  | "star";

// Preset names
export type PowerlinePlacement = "above" | "below";

export type StatusLinePreset =
  "default" | "minimal" | "compact" | "full" | "nerd" | "ascii" | "chef";

// Per-segment options
export interface StatusLineSegmentOptions {
  model?: { showThinkingLevel?: boolean; display?: "name" | "qualified" };
  path?: {
    mode?: "basename" | "abbreviated" | "full";
    maxLength?: number;
  };
  git?: {
    showBranch?: boolean;
    showStaged?: boolean;
    showUnstaged?: boolean;
    showUntracked?: boolean;
    polling?: "full" | "branch" | "off";
    /** Replace the branch icon with the origin remote's host logo
     * (GitHub/GitLab/Bitbucket, or a generic git logo). Default false. */
    hostIcon?: boolean;
    /** Show the upstream ahead/behind commit counts (↑/↓). Default true. */
    showAheadBehind?: boolean;
    /** Show the latest commit on HEAD (short hash + subject). Default true. */
    showCommit?: boolean;
    /** Max length of the commit subject before truncation. Default 24. */
    maxCommitSubjectLength?: number;
  };
  time?: { format?: "12h" | "24h"; showSeconds?: boolean };
  cost?: {
    subscriptionDisplay?: "subscription" | "reported-cost" | "both";
    currency?: CostCurrencyCode;
  };
  context?: { format?: "full" | "percent" };
  cache_read?: { format?: "tokens" | "percent" | "both" };
  openPorts?: {
    /** Include UDP listeners (mDNS/DHCP/ephemeral) in the count. Default false. */ includeUdp?: boolean;
  };
}

export type CustomItemPosition = "left" | "right" | "secondary";

export interface StatusLineLayout {
  left?: StatusLineSegmentId[];
  right?: StatusLineSegmentId[];
  secondary?: StatusLineSegmentId[];
}

export interface CustomStatusItem {
  id: string;
  statusKey: string;
  position: CustomItemPosition;
  color?: ColorValue;
  prefix?: string;
  hideWhenMissing: boolean;
  excludeFromExtensionStatuses: boolean;
}

// Preset definition
export interface PresetDef {
  leftSegments: StatusLineSegmentId[];
  rightSegments: StatusLineSegmentId[];
  /** Secondary row segments (shown in footer, above sub bar) */
  secondarySegments?: StatusLineSegmentId[];
  separator: StatusLineSeparatorStyle;
  segmentOptions?: StatusLineSegmentOptions;
  /** Color scheme for this preset */
  colors?: ColorScheme;
}

// Separator definition
export interface SeparatorDef {
  left: string;
  right: string;
  endCaps?: {
    left: string;
    right: string;
    useBgAsFg: boolean;
  };
}

// Git status data
export interface GitStatus {
  branch: string | null;
  staged: number;
  unstaged: number;
  untracked: number;
  /** Commits ahead of the configured upstream branch. */
  ahead: number;
  /** Commits behind the configured upstream branch. */
  behind: number;
  /** Latest commit on HEAD: short hash plus subject line. */
  commit: { short: string; subject: string } | null;
}

// Usage statistics
export interface QueueSummary {
  queueCount: number;
  ideaCount: number;
  blockedCount: number;
  compacting: boolean;
  leadingText: string | null;
  leadingIntent: "steer" | "follow-up" | "post-compact" | "idea" | null;
  leadingStatus: "queued" | "blocked" | "delivering" | "sent" | "failed" | null;
}

export interface UsageStats {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  // Cumulative cost of subagent child runs (e.g. /parallel, /worker) launched from this session.
  subagentCost: number;
}

// Context passed to segment render functions
export interface SegmentContext {
  // From pi-mono
  model:
    | {
        id: string;
        name?: string;
        provider?: string;
        providerId?: string;
        providerName?: string;
        reasoning?: boolean;
        contextWindow?: number;
      }
    | undefined;
  thinkingLevel: string;
  sessionId: string | undefined;
  cwd?: string;

  // Computed
  usageStats: UsageStats;
  contextTokens: number;
  contextPercent: number;
  contextWindow: number;
  autoCompactEnabled: boolean;
  customCompactionEnabled: boolean;
  usingSubscription: boolean;
  queueSummary: QueueSummary;
  sessionStartTime: number;
  shellModeActive: boolean;
  shellRunning: boolean;
  shellName: string | null;
  shellCwd: string | null;

  // Git
  git: GitStatus;

  // Extension statuses
  extensionStatuses: ReadonlyMap<string, string>;
  hiddenExtensionStatusKeys: ReadonlySet<string>;
  customItemsById: ReadonlyMap<string, CustomStatusItem>;

  // Options
  options: StatusLineSegmentOptions;
  /** Per-segment custom text labels (from powerline.segmentLabels). */
  segmentLabels: ReadonlyMap<string, string>;

  // Theming
  theme: ThemeLike;
  colors: ColorScheme;
}

// Rendered segment output
export interface RenderedSegment {
  content: string;
  visible: boolean;
}

// Segment definition
export interface StatusLineSegment {
  id: StatusLineSegmentId;
  render(ctx: SegmentContext): RenderedSegment;
}

// User-defined computed segment (configured via settings, no TS needed)
export type CustomSegmentConfig =
  | {
      type: "command";
      command: string;
      prefix?: string;
      color?: ColorValue;
      /** Cache command output for this many ms to avoid re-running every paint */
      cacheMs?: number;
    }
  | {
      type: "env";
      env: string;
      prefix?: string;
      color?: ColorValue;
      fallback?: string;
    }
  | {
      type: "static";
      text: string;
      prefix?: string;
      color?: ColorValue;
    };

// User-defined preset (configured via settings, merges with built-ins)
export interface CustomPresetConfig {
  left?: StatusLineSegmentId[];
  right?: StatusLineSegmentId[];
  secondary?: StatusLineSegmentId[];
  separator?: StatusLineSeparatorStyle;
  colors?: ColorScheme;
  segmentOptions?: StatusLineSegmentOptions;
}
