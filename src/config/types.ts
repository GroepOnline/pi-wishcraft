import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import type { MotionEvent } from "../motion/types.ts";
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

/**
 * Semantic design tokens (vNext). Presets fill abstract roles; the segment
 * colors above are derived from them. See src/config/tokens.ts for the mapping
 * and the default palette.
 */
export interface WishcraftTokens {
  /** Deck background. */
  surface: ColorValue;
  /** Raised areas: headers, footers, selected rows. */
  surfaceRaised: ColorValue;
  text: ColorValue;
  textMuted: ColorValue;
  primary: ColorValue;
  secondary: ColorValue;
  accent: ColorValue;
  success: ColorValue;
  warning: ColorValue;
  error: ColorValue;
  /** Focused control or active route. */
  focus: ColorValue;
  /** Selected row background. */
  selection: ColorValue;
  /** Resting motion, e.g. a still rail. */
  motionDim: ColorValue;
  /** The travelling head of a sweep. */
  motionHot: ColorValue;
  /** Cells just behind the head. */
  motionTrail: ColorValue;
}

export type TokenRole = keyof WishcraftTokens;

/** Motion catalog id, e.g. `ember-relay`. */
export type MotionRef = string;

export type StructuralPresetName =
  | "lanternwake"
  | "threadbound"
  | "scryglass"
  | "runebloom"
  | "moonwell"
  | "hexforge"
  | "vellum"
  | "wisp"
  | "starweave"
  | "crucible";

export const STRUCTURAL_PRESET_NAMES = [
  "lanternwake",
  "threadbound",
  "scryglass",
  "runebloom",
  "moonwell",
  "hexforge",
  "vellum",
  "wisp",
  "starweave",
  "crucible",
] as const satisfies readonly StructuralPresetName[];

export type ChromeFrame = "rounded" | "square" | "double" | "minimal" | "borderless";
export type ChromeDensity = "compact" | "medium" | "spacious";

export interface ChromeSpec {
  frame: ChromeFrame;
  corners: { tl: string; tr: string; bl: string; br: string };
  dividers: { horizontal: string; vertical: string; cross: string };
  density: ChromeDensity;
}

export type SignalLayout =
  | "standard"
  | "capsule"
  | "woven"
  | "sparse"
  | "block"
  | "arc"
  | "editorial"
  | "fluid"
  | "constellation"
  | "cell";

export interface SignalSpec {
  layout: SignalLayout;
  separators: {
    left: string;
    right: string;
    subLeft?: string;
    subRight?: string;
  };
  caps: {
    leftOpen?: string;
    leftClose?: string;
    rightOpen?: string;
    rightClose?: string;
  };
  /** Signature lane animation from the motion catalog. */
  animation: MotionRef;
}

export type DeckNavigation = "tabs" | "rail" | "minimal";
export type DeckPanelStyle = "framed" | "borderless" | "inset";
export type DeckActivityStyle = "pulse" | "bar" | "none";

export interface DeckSpec {
  navigation: DeckNavigation;
  panelStyle: DeckPanelStyle;
  activityStyle: DeckActivityStyle;
}

export interface WelcomeSpec {
  lantern: boolean;
  ambient: boolean;
  motionId?: MotionRef;
}

export type GlyphMode = "nerd" | "ascii" | "auto";

export interface GlyphSet {
  mode: GlyphMode;
  /** Leading ornament for the model segment (Nerd). */
  model?: string;
  /** ASCII fallback for the model ornament. */
  modelAscii?: string;
  /** Default segment marker (Nerd). */
  segment?: string;
  /** ASCII fallback for segment markers. */
  segmentAscii?: string;
}

/** vNext structural personality: tokens, chrome, signal grammar, motion, deck, welcome, glyphs. */
export interface StructuralPresetDef {
  name: StructuralPresetName;
  displayName: string;
  description: string;
  tokens: Partial<WishcraftTokens>;
  chrome: ChromeSpec;
  signal: SignalSpec;
  motion: Partial<Record<MotionEvent, MotionRef>>;
  deck: DeckSpec;
  welcome: WelcomeSpec;
  glyphs: GlyphSet;
}

/**
 * Decoupled appearance layers. Each field can point at a different structural
 * preset so palette, signal layout, chrome, and motion stay independent.
 */
export interface AppearanceMixConfig {
  base?: StructuralPresetName;
  palette?: StructuralPresetName;
  signalLayout?: StructuralPresetName;
  chrome?: StructuralPresetName;
  glyphs?: StructuralPresetName;
  deck?: StructuralPresetName;
  welcome?: StructuralPresetName;
  motion?: StructuralPresetName | Partial<Record<MotionEvent, MotionRef>>;
}

export interface ResolvedAppearance {
  base: StructuralPresetName;
  tokens: WishcraftTokens;
  chrome: ChromeSpec;
  signal: SignalSpec;
  motion: Partial<Record<MotionEvent, MotionRef>>;
  deck: DeckSpec;
  welcome: WelcomeSpec;
  glyphs: GlyphSet;
}

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
  | "star"
  | "blunt"
  | "rounded"
  | "diamond"
  | "double";

// Preset names
export type PowerlinePlacement = "above" | "below";

export type StatusLinePreset =
  | "default"
  | "minimal"
  | "compact"
  | "full"
  | "nerd"
  | "ascii"
  | "chef"
  // vNext Structural Signature Presets
  | "lanternwake"
  | "threadbound"
  | "scryglass"
  | "runebloom"
  | "moonwell"
  | "hexforge"
  | "vellum"
  | "wisp"
  | "starweave"
  | "crucible";

// Optional `{value}` template override shared by all segment option groups.
// Replaces `{value}` in the rendered value text (e.g. "{value} tok/s").
export interface SegmentFormatOption {
  template?: string;
}

// Per-segment options
export interface StatusLineSegmentOptions {
  model?: SegmentFormatOption & {
    showThinkingLevel?: boolean;
    display?: "name" | "qualified";
  };
  path?: SegmentFormatOption & {
    mode?: "basename" | "abbreviated" | "full";
    maxLength?: number;
  };
  git?: SegmentFormatOption & {
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
  time?: SegmentFormatOption & { format?: "12h" | "24h"; showSeconds?: boolean };
  cost?: SegmentFormatOption & {
    subscriptionDisplay?: "subscription" | "reported-cost" | "both";
    currency?: CostCurrencyCode;
  };
  context?: SegmentFormatOption & { format?: "full" | "percent" };
  cache_read?: SegmentFormatOption & { format?: "tokens" | "percent" | "both" };
  openPorts?: SegmentFormatOption & {
    /** Include UDP listeners (mDNS/DHCP/ephemeral) in the count. Default false. */
    includeUdp?: boolean;
    /**
     * SSH host to probe instead of the local machine (fleet open-ports).
     * Best-effort, opt-in: requires passwordless/agent SSH to that host and
     * falls back to `?` when the probe cannot run.
     */
    host?: string;
  };
  tps?: SegmentFormatOption & {
    /** Sliding rate window length in ms (default 1000; wider = smoother, e.g. 2000 for fast models). */
    windowMs?: number;
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


export interface PresetDef {
  leftSegments: StatusLineSegmentId[];
  rightSegments: StatusLineSegmentId[];
  /** Secondary row segments (shown in footer, above sub bar) */
  secondarySegments?: StatusLineSegmentId[];
  separator: StatusLineSeparatorStyle;
  segmentOptions?: StatusLineSegmentOptions;
  /** Color scheme for this preset */
  colors?: ColorScheme;
  /**
   * Semantic design tokens (vNext). When present, `colors` is derived from these
   * and any explicit `colors` entry still wins. Optional, so the presets that
   * predate tokens keep rendering exactly as before.
   */
  tokens?: Partial<WishcraftTokens>;
  /** Deck and overlay frame geometry (vNext). */
  chrome?: ChromeSpec;
  /** Signal lane grammar and separators (vNext). */
  signal?: SignalSpec;
  /** Per-event motion overrides (vNext). */
  motion?: Partial<Record<MotionEvent, MotionRef>>;
  /** Deck navigation and panel chrome (vNext). */
  deck?: DeckSpec;
  /** Welcome screen lantern and ambient motion (vNext). */
  welcome?: WelcomeSpec;
  /** Nerd / ASCII glyph grammar (vNext). */
  glyphs?: GlyphSet;
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
  /** Explicit custom items + auto-promoted status items (customItems.auto). */
  effectiveCustomItems: readonly CustomStatusItem[];

  // Options
  options: StatusLineSegmentOptions;
  /** Per-segment custom text labels (from powerline.segmentLabels). */
  segmentLabels: ReadonlyMap<string, string>;

  /** Daily token budget progress (wishcraft.tokenBudget.daily). */
  tokenBudget?: { dailyLimit: number | null; dailyUsed: number };

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
  /** Semantic design tokens; `colors` entries still win over derived values. */
  tokens?: Partial<WishcraftTokens>;
}
