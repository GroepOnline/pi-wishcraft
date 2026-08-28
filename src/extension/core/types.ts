import type { ReadonlyFooterDataProvider } from "@earendil-works/pi-coding-agent";

import type { BashModeSettings } from "../../../bash-mode/types.ts";
import type { BashTranscriptStore } from "../../../bash-mode/transcript.ts";
import type { BashCompletionEngine } from "../../../bash-mode/completion.ts";
import type { ManagedShellSessionLike } from "../../../bash-mode/types.ts";
import type { PowerlineQueueStore } from "../../../queue/store.ts";
import type {
  SessionAssistantUsage,
  SessionBranchCache,
  SessionTokenStatsCache,
} from "../../usage/ledger.ts";
import type { CoreContextUsageCache } from "../../usage/context.ts";
import type { TokenBudgetSnapshot } from "../../usage/token-budget.ts";
import type { WelcomeDismissScheduler } from "../../welcome/auto-dismiss.ts";
import type { RenderScheduler } from "../../render/timer.ts";
import type { MotionPolicy, MotionScheduler } from "../../motion/index.ts";
import type { SignalRuntime } from "../../signal/controller.ts";

export type ShortcutBinding = string | null;

export interface PowerlineShortcuts {
  stashHistory: ShortcutBinding;
  copyEditor: ShortcutBinding;
  cutEditor: ShortcutBinding;
  ideaCapture: ShortcutBinding;
  queueOpen: ShortcutBinding;
  editorStart: ShortcutBinding;
  editorEnd: ShortcutBinding;
  /** Open the powerline main menu (navigate segments / configure / info). */
  menu: ShortcutBinding;
  /** Open the powerline info view (full open-ports list, TPS detail). */
  info: ShortcutBinding;
}

export type PowerlineShortcutKey = keyof PowerlineShortcuts;
export type PowerlineShortcutAction =
  | { kind: "stashHistory" }
  | { kind: "copyEditor" }
  | { kind: "cutEditor" }
  | { kind: "ideaCapture" }
  | { kind: "queueOpen" }
  | { kind: "bashMode" }
  | { kind: "powerlineMenu" }
  | { kind: "powerlineInfo" };

export interface RuntimeState {
  enabled: boolean;
  sessionStartTime: number;
  sessionGeneration: number;
  currentCtx: any;
  footerDataRef: ReadonlyFooterDataProvider | null;
  getThinkingLevelFn: (() => string) | null;
  currentThinkingLevel: string | null;
  liveAssistantUsage: SessionAssistantUsage | null;
  isStreaming: boolean;
  tuiRef: any;
  restoreFooterStatusRepaintHook: (() => void) | null;
  stashShortcutInputUnsubscribe: (() => void) | null;
  dismissWelcomeOverlay: (() => void) | null;
  welcomeHeaderActive: boolean;
  welcomeOverlayShouldDismiss: boolean;
  lastUserPrompt: string;
  showLastPrompt: boolean;
  stashedEditorText: string | null;
  stashedPromptHistory: string[];
  currentEditor: any;
  /** True once the configured `costAlert` threshold has been notified this session. */
  costAlertNotified: boolean;
  /** Highest daily-budget warning already shown this session (0 / 80 / 100). */
  tokenBudgetNotifiedLevel: 0 | 80 | 100;
  /** Event-driven token-budget snapshot consumed by render paths without disk I/O. */
  tokenBudgetSnapshot: TokenBudgetSnapshot;
  bashModeActive: boolean;
  bashTranscript: BashTranscriptStore;
  bashCompletionEngine: BashCompletionEngine;
  shellSession: ManagedShellSessionLike | null;
  queueStore: PowerlineQueueStore;
  powerlineCompacting: boolean;
  deliverAfterRetrySettles: boolean;
  queueDeliveryTimer: ReturnType<typeof setTimeout> | null;

  // Cache for the top and secondary powerline widgets.
  lastLayoutWidth: number;
  lastLayoutResult: {
    topContent: string;
    secondaryContent: string;
  } | null;
  lastLayoutTimestamp: number;
  layoutDirty: boolean;
  forceNextLayoutRecompute: boolean;
  lastEditorInputAt: number;

  // Cache for token counting: avoid re-scanning the full session event list
  // on every render (250ms-1s cadence). Revalidates the trailing event's
  // stats signature so in-place streaming updates are not served stale.
  sessionBranchCache: SessionBranchCache;
  tokenStatsCache: SessionTokenStatsCache;
  coreContextUsageCache: CoreContextUsageCache;

  resolvedShortcuts: PowerlineShortcuts;
  bashModeSettings: BashModeSettings;

  welcomeDismissScheduler: WelcomeDismissScheduler<any>;
  statusRenderScheduler: RenderScheduler;
  /** The single shared clock for every Wishcraft animation surface. */
  motionScheduler: MotionScheduler;
  motionPolicy: MotionPolicy;
  /** Live Signal event, motion frame, and activity label. */
  signal: SignalRuntime;
}