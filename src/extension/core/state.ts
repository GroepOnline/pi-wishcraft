import type { PowerlineConfig } from "../../config/powerline-config.ts";
import type { StatusLinePreset } from "../../config/types.ts";
import { PRESETS } from "../../config/presets.ts";
import { BashTranscriptStore } from "../../../bash-mode/transcript.ts";
import { BashCompletionEngine } from "../../../bash-mode/completion.ts";
import { ManagedShellSession } from "../../../bash-mode/shell-session.ts";
import { PowerlineQueueStore } from "../../../queue/store.ts";
import {
  SessionBranchCache,
  SessionTokenStatsCache,
} from "../../usage/ledger.ts";
import { CoreContextUsageCache } from "../../usage/context.ts";
import { createWelcomeDismissScheduler } from "../../welcome/auto-dismiss.ts";
import { createRenderScheduler } from "../../render/timer.ts";
import { MotionScheduler, motionPolicyFromEnvironment, parseMotionSettings } from "../../motion/index.ts";
import { createSignalRuntime } from "../../signal/controller.ts";
import {
  resolveShortcutConfig,
  parseBashModeSettings,
} from "../shortcuts/shortcuts-config.ts";
import { readPersistedStashHistory } from "../history/stash-history.ts";
import { dismissWelcome } from "../welcome/welcome-control.ts";
import {
  EDITOR_STATUS_DEFER_MS,
  STATUS_RENDER_DEBOUNCE_MS,
} from "./constants.ts";
import type { RuntimeState } from "./types.ts";

// ═══════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════

export let config: PowerlineConfig = {
  preset: "default",
  customItems: [],
  disabledSegments: [],
  invalidDisabledSegments: [],
  layout: null,
  invalidLayoutSegments: [],
  separator: null,
  segmentOptions: {},
  placement: "above",
  invalidPlacement: null,
  welcome: true,
  stashSharpSShortcut: false,
  costAlert: null,
  customItemsAuto: false,
  queue: { captureSigil: "#", retentionHours: 24 },
  segments: {},
  presets: {},
  segmentLabels: {},
  appearance: {},
};

export function setConfig(next: PowerlineConfig): void {
  config = next;
}

export let customCompactionEnabled = false;

export function setCustomCompactionEnabled(next: boolean): void {
  customCompactionEnabled = next;
}

export const PRESET_NAMES = Object.keys(PRESETS) as StatusLinePreset[];

export function isValidPreset(value: unknown): value is StatusLinePreset {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(PRESETS, value)
  );
}

export function normalizePreset(value: unknown): StatusLinePreset | null {
  if (typeof value !== "string") {
    return null;
  }

  const preset = value.trim().toLowerCase();
  return isValidPreset(preset) ? preset : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Runtime state
// ═══════════════════════════════════════════════════════════════════════════

export function createRuntimeState(
  startupSettings: Record<string, unknown>,
): RuntimeState {
  const resolvedShortcuts = resolveShortcutConfig(startupSettings);
  const bashModeSettings = parseBashModeSettings(
    startupSettings,
    resolvedShortcuts,
  );

  const rt = {
    enabled: true,
    sessionStartTime: Date.now(),
    sessionGeneration: 0,
    currentCtx: null,
    footerDataRef: null,
    getThinkingLevelFn: null,
    currentThinkingLevel: null,
    liveAssistantUsage: null,
    isStreaming: false,
    tuiRef: null,
    restoreFooterStatusRepaintHook: null,
    stashShortcutInputUnsubscribe: null,
    dismissWelcomeOverlay: null,
    welcomeHeaderActive: false,
    welcomeOverlayShouldDismiss: false,
    lastUserPrompt: "",
    showLastPrompt: true,
    stashedEditorText: null,
    stashedPromptHistory: readPersistedStashHistory(),
    currentEditor: null,
    costAlertNotified: false,
    tokenBudgetNotifiedLevel: 0,
    bashModeActive: false,
    bashTranscript: new BashTranscriptStore(bashModeSettings),
    bashCompletionEngine: new BashCompletionEngine(),
    shellSession: null,
    queueStore: new PowerlineQueueStore(),
    powerlineCompacting: false,
    deliverAfterRetrySettles: false,
    queueDeliveryTimer: null,

    lastLayoutWidth: 0,
    lastLayoutResult: null,
    lastLayoutTimestamp: 0,
    layoutDirty: true,
    forceNextLayoutRecompute: false,
    lastEditorInputAt: 0,

    sessionBranchCache: new SessionBranchCache(),
    tokenStatsCache: new SessionTokenStatsCache(),
    coreContextUsageCache: new CoreContextUsageCache(),

    resolvedShortcuts,
    bashModeSettings,
    motionPolicy: motionPolicyFromEnvironment(
      process.env,
      parseMotionSettings(startupSettings.wishcraft),
    ),
    signal: createSignalRuntime(),
  } as RuntimeState;

  rt.welcomeDismissScheduler = createWelcomeDismissScheduler({
    dismiss: (ctx: unknown) => dismissWelcome(rt, ctx),
    getGeneration: () => rt.sessionGeneration,
    isEnabled: () => rt.enabled,
  });

  rt.statusRenderScheduler = createRenderScheduler(() => {
    const msSinceInput = Date.now() - rt.lastEditorInputAt;
    if (
      rt.layoutDirty &&
      !rt.forceNextLayoutRecompute &&
      msSinceInput < EDITOR_STATUS_DEFER_MS
    ) {
      rt.statusRenderScheduler.schedule(
        Math.max(0, EDITOR_STATUS_DEFER_MS - msSinceInput),
      );
      return;
    }

    rt.tuiRef?.requestRender();
  }, STATUS_RENDER_DEBOUNCE_MS);

  rt.motionScheduler = new MotionScheduler({
    requestRender: () => {
      // Motion only changes the Signal rail; segment data remains cached.
      rt.lastLayoutResult = null;
      rt.tuiRef?.requestRender();
    },
  });

  return rt;
}
