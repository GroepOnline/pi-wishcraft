import type {
  ReadonlyFooterDataProvider,
  Theme,
} from "@earendil-works/pi-coding-agent";

import type { SegmentContext, ColorScheme } from "../../config/types.ts";
import { getPreset } from "../../config/presets.ts";
import { liveColorScheme } from "../../config/appearance.ts";
import {
  collectHiddenExtensionStatusKeys,
  deriveAutoCustomItems,
  mergeSegmentOptions,
} from "../../config/powerline-config.ts";
import { getDefaultColors } from "../../theme/theme.ts";
import { getGitStatus } from "../../git/status.ts";
import { getQueueContext } from "../queue/queue-context.ts";
import { getUsageTokenTotal } from "../../usage/ledger.ts";
import { resolveDisplayContextUsage } from "../../usage/context.ts";
import type { SessionAssistantUsage } from "../../usage/ledger.ts";
import {
  pushTpsSample,
  ringMsForWindow,
  tpsSamples,
} from "../../usage/tps-ring.ts";
import { tokenBudgetSnapshotForDay } from "../../usage/token-budget.ts";
import { dayKey } from "../../usage/usage-store.ts";
import {
  CUSTOM_COMPACTION_STATUS_KEY,
  EDITOR_STATUS_DEFER_MS,
} from "./constants.ts";
import { config, customCompactionEnabled } from "./state.ts";
import { HIDDEN_POWERLINE_STATUS_KEYS } from "./status-export.ts";
import type { RuntimeState } from "./types.ts";

/**
 * Reset the cached layout + underlying session-scan caches. Called on
 * session boundaries and whenever config that affects layout changes.
 */
export function resetLayoutCache(rt: RuntimeState): void {
  rt.lastLayoutResult = null;
  rt.layoutParts = null;
  rt.layoutDirty = true;
  rt.tokenStatsCache.reset();
  rt.coreContextUsageCache.reset();
}

export function requestStatusRender(rt: RuntimeState, delayMs?: number): void {
  rt.layoutDirty = true;
  rt.statusRenderScheduler.schedule(delayMs);
}

export function requestImmediateStatusRender(
  rt: RuntimeState,
  options: { deferDuringTyping?: boolean } = {},
): void {
  rt.layoutDirty = true;
  if (
    options.deferDuringTyping !== false &&
    Date.now() - rt.lastEditorInputAt < EDITOR_STATUS_DEFER_MS
  ) {
    rt.statusRenderScheduler.schedule();
    return;
  }

  rt.forceNextLayoutRecompute = true;
  rt.statusRenderScheduler.cancel();
  rt.statusRenderScheduler.schedule(0);
}

export function installFooterStatusRepaintHook(
  rt: RuntimeState,
  footerData: ReadonlyFooterDataProvider,
): void {
  rt.restoreFooterStatusRepaintHook?.();
  rt.restoreFooterStatusRepaintHook = null;

  const writableFooterData = footerData as ReadonlyFooterDataProvider & {
    setExtensionStatus?: (key: string, text: string | undefined) => void;
    clearExtensionStatuses?: () => void;
  };
  if (typeof writableFooterData.setExtensionStatus !== "function") return;

  const originalSetExtensionStatus = writableFooterData.setExtensionStatus;
  const originalClearExtensionStatuses =
    writableFooterData.clearExtensionStatuses;
  const setExtensionStatusAndRepaint = function setExtensionStatusAndRepaint(
    this: unknown,
    key: string,
    text: string | undefined,
  ) {
    originalSetExtensionStatus.call(this, key, text);
    requestImmediateStatusRender(rt);
  };
  writableFooterData.setExtensionStatus = setExtensionStatusAndRepaint;

  let clearExtensionStatusesAndRepaint: (() => void) | null = null;
  if (typeof originalClearExtensionStatuses === "function") {
    clearExtensionStatusesAndRepaint =
      function clearExtensionStatusesAndRepaint(this: unknown) {
        originalClearExtensionStatuses.call(this);
        requestImmediateStatusRender(rt);
      };
    writableFooterData.clearExtensionStatuses =
      clearExtensionStatusesAndRepaint;
  }

  rt.restoreFooterStatusRepaintHook = () => {
    if (
      writableFooterData.setExtensionStatus === setExtensionStatusAndRepaint
    ) {
      writableFooterData.setExtensionStatus = originalSetExtensionStatus;
    }
    if (
      clearExtensionStatusesAndRepaint &&
      writableFooterData.clearExtensionStatuses ===
        clearExtensionStatusesAndRepaint
    ) {
      writableFooterData.clearExtensionStatuses =
        originalClearExtensionStatuses;
    }
  };
}

export interface BuildSegmentContextOptions {
  /** Omit token-budget data from lightweight UI snapshots. */
  includeTokenBudget?: boolean;
}

/**
 * Structural subset of Pi's extension context that the context builder reads.
 * Typed rather than `any` so a renamed Pi accessor fails the typecheck here
 * instead of silently rendering defaults at runtime.
 */
export interface SegmentSourceContext {
  sessionManager?: { getSessionId?: () => string | undefined };
  model?: SegmentContext["model"];
  modelRegistry?: {
    // Pi types this as `(model: Model<Api>) => boolean`. Method-bivariance
    // keeps that signature assignable without widening the segment model
    // shape to the full SDK `Model` type.
    isUsingOAuth?: {
      bivariance(model: NonNullable<SegmentContext["model"]>): boolean;
    }["bivariance"];
  };
  cwd?: string;
  settingsManager?: {
    getCompactionSettings?: () => { enabled?: boolean } | undefined;
  };
}

interface ContextMetrics {
  contextTokens: number | null;
  contextPercent: number | null;
  contextWindow: number;
  contextApproximate: boolean;
}

/**
 * Token/context numbers: cached core usage wins, the live assistant usage is
 * the fallback, and the model's window bounds the percentage.
 */
function resolveContextMetrics(
  rt: RuntimeState,
  ctx: SegmentSourceContext,
  usage: SessionAssistantUsage | undefined,
): ContextMetrics {
  const core =
    rt.isStreaming && rt.liveAssistantUsage ? null : rt.coreContextUsageCache.get(ctx);
  const resolved = resolveDisplayContextUsage({
    coreContextUsage: core,
    unknownCoreFallback: rt.approximateContextUsage,
    fallbackContextTokens: usage ? getUsageTokenTotal(usage) : 0,
    fallbackContextWindow: ctx.model?.contextWindow ?? 0,
  });
  return {
    contextTokens: resolved?.contextTokens ?? null,
    contextPercent: resolved?.contextPercent ?? null,
    contextWindow: resolved?.contextWindow ?? ctx.model?.contextWindow ?? 0,
    contextApproximate:
      (core === null || core.contextTokens === null) &&
      rt.approximateContextUsage !== null,
  };
}

interface CustomItemState {
  effectiveCustomItems: SegmentContext["effectiveCustomItems"];
  customItemsById: SegmentContext["customItemsById"];
  hiddenExtensionStatusKeys: Set<string>;
}

/** Merge configured + auto-discovered custom items and hide claimed statuses. */
function resolveCustomItemState(
  extensionStatuses: ReadonlyMap<string, string>,
): CustomItemState {
  const excludedStatusKeys = new Set<string>([
    CUSTOM_COMPACTION_STATUS_KEY,
    "stash",
    ...HIDDEN_POWERLINE_STATUS_KEYS,
  ]);
  const effectiveCustomItems = deriveAutoCustomItems(
    config.customItems,
    extensionStatuses,
    config.customItemsAuto,
    excludedStatusKeys,
  );
  const customItemsById = new Map(
    effectiveCustomItems.map((item) => [item.id, item]),
  );
  const hiddenExtensionStatusKeys = collectHiddenExtensionStatusKeys(
    effectiveCustomItems,
  );
  for (const key of HIDDEN_POWERLINE_STATUS_KEYS) {
    hiddenExtensionStatusKeys.add(key);
  }
  return { effectiveCustomItems, customItemsById, hiddenExtensionStatusKeys };
}

export function buildSegmentContext(
  rt: RuntimeState,
  ctx: SegmentSourceContext,
  theme: Theme,
  options: BuildSegmentContextOptions = {},
): SegmentContext {
  const presetDef = getPreset(config.preset);
  const colors: ColorScheme = liveColorScheme(
    presetDef,
    config.appearance,
    config.preset,
    getDefaultColors,
  );

  // Usage stats are cached; the full session ledger is only re-scanned when
  // entries are appended or the trailing entry's stats-relevant fields change
  // (e.g. in-place streaming updates). Totals bill the whole session file.
  const tokenStats = rt.tokenStatsCache.get(ctx.sessionManager);
  const { input, output, cacheRead, cacheWrite, cost, subagentCost } =
    tokenStats;
  const lastAssistant = tokenStats.lastAssistant;

  const latestUsage = rt.isStreaming
    ? (rt.liveAssistantUsage ?? lastAssistant?.usage)
    : lastAssistant?.usage;
  const {
    contextTokens,
    contextPercent,
    contextWindow,
    contextApproximate,
  } = resolveContextMetrics(rt, ctx, latestUsage);

  const segmentOptions = mergeSegmentOptions(
    presetDef.segmentOptions,
    config.segmentOptions,
  );

  const gitBranch = rt.footerDataRef?.getGitBranch() ?? null;
  const gitStatus = getGitStatus(gitBranch, segmentOptions.git?.polling);
  const extensionStatuses = rt.footerDataRef?.getExtensionStatuses() ?? new Map();
  const { effectiveCustomItems, customItemsById, hiddenExtensionStatusKeys } =
    resolveCustomItemState(extensionStatuses);

  const usingSubscription = ctx.model
    ? (ctx.modelRegistry?.isUsingOAuth?.(ctx.model) ?? false)
    : false;

  const thinkingLevel =
    rt.currentThinkingLevel ??
    tokenStats.thinkingLevelFromSession ??
    rt.getThinkingLevelFn?.() ??
    "off";
  const queueSummary = rt.queueStore.summarize(
    getQueueContext(ctx),
    rt.powerlineCompacting,
  );
  const budgetSnapshot = tokenBudgetSnapshotForDay(
    rt.tokenBudgetSnapshot,
    dayKey(Date.now()),
  );

  return {
    model: ctx.model,
    thinkingLevel,
    sessionId: ctx.sessionManager?.getSessionId?.(),
    cwd: ctx.cwd,
    usageStats: { input, output, cacheRead, cacheWrite, cost, subagentCost },
    lastRequestCache: tokenStats.lastRequestCache,
    contextTokens,
    contextPercent,
    contextApproximate,
    contextWindow,
    autoCompactEnabled:
      ctx.settingsManager?.getCompactionSettings?.()?.enabled ?? true,
    customCompactionEnabled:
      customCompactionEnabled ||
      extensionStatuses.has(CUSTOM_COMPACTION_STATUS_KEY),
    usingSubscription,
    queueSummary,
    sessionStartTime: rt.sessionStartTime,
    shellModeActive: rt.bashModeActive,
    shellRunning: rt.shellSession?.state.running ?? false,
    shellName: rt.shellSession?.state.shellName ?? null,
    shellCwd: rt.shellSession?.state.cwd ?? null,
    git: gitStatus,
    extensionStatuses,
    hiddenExtensionStatusKeys,
    customItemsById,
    effectiveCustomItems,
    options: segmentOptions,
    segmentLabels: new Map(Object.entries(config.segmentLabels)),
    tokenBudget:
      options.includeTokenBudget === false
        ? undefined
        : {
            dailyLimit: budgetSnapshot.dailyLimit,
            dailyUsed: budgetSnapshot.dailyUsed,
          },
    theme,
    colors,
  };
}
const TPS_EVENT_MIN_GAP_MS = 30;
let lastTpsEventAt = 0;
let lastMarkedTurnStart: number | null = null;

/**
 * Event-driven TPS sampling, called from `message_update`. The ring used to be
 * filled only while the `tps` segment rendered, so presets without that segment
 * left `/tps` empty and every unrelated repaint added a duplicate sample.
 *
 * This is also the only writer of the turn marker: the first sample of a turn
 * carries `turnStartAt`, the rest do not, so `measureTurn` can find both the
 * turn boundary and the sample that produced its first token.
 */
export function sampleTpsFromSession(
  rt: RuntimeState,
  ctx: SegmentSourceContext,
  now: number = Date.now(),
): void {
  if (now - lastTpsEventAt < TPS_EVENT_MIN_GAP_MS) return;
  lastTpsEventAt = now;
  const { input, output, cacheRead } = rt.tokenStatsCache.get(
    ctx.sessionManager,
  );
  const windowMs =
    mergeSegmentOptions(getPreset(config.preset).segmentOptions, config.segmentOptions)
      .tps?.windowMs ?? 1000;
  const turnStartAt =
    rt.turnStartedAt !== null && rt.turnStartedAt !== lastMarkedTurnStart
      ? (lastMarkedTurnStart = rt.turnStartedAt)
      : undefined;
  pushTpsSample(
    tpsSamples,
    {
      at: now,
      output,
      input,
      uncachedInput: Math.max(0, input - cacheRead),
      ...(turnStartAt === undefined ? {} : { turnStartAt }),
    },
    ringMsForWindow(windowMs),
  );
}
