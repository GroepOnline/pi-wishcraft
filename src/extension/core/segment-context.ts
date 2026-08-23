import type {
  ReadonlyFooterDataProvider,
  Theme,
} from "@earendil-works/pi-coding-agent";

import type { SegmentContext, ColorScheme } from "../../config/types.ts";
import { getPreset } from "../../config/presets.ts";
import {
  collectHiddenExtensionStatusKeys,
  deriveAutoCustomItems,
  mergeSegmentOptions,
} from "../../config/powerline-config.ts";
import { getDefaultColors } from "../../theme/theme.ts";
import { presetColorScheme } from "../../config/tokens.ts";
import { getGitStatus } from "../../git/status.ts";
import { getQueueContext } from "../queue/queue-context.ts";
import { getUsageTokenTotal } from "../../usage/ledger.ts";
import {
  dayKey,
  loadUsageFileFromDisk,
  tokenTotal,
  totalsForRange,
} from "../../usage/usage-store.ts";
import { parseTokenBudget } from "../../usage/token-budget.ts";
import { readSettings } from "../settings/settings-io.ts";
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
  rt.layoutDirty = true;
  rt.sessionBranchCache.reset();
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

export function buildSegmentContext(
  rt: RuntimeState,
  ctx: any,
  theme: Theme,
): SegmentContext {
  const presetDef = getPreset(config.preset);
  const colors: ColorScheme = presetColorScheme(presetDef, getDefaultColors);

  // Build usage stats and get thinking level from session (cached; the full
  // event list is only re-scanned when events are appended or the trailing
  // event's stats-relevant fields change, e.g. in-place streaming updates)
  const sessionEvents = rt.sessionBranchCache.get(ctx.sessionManager);
  const tokenStats = rt.tokenStatsCache.get(sessionEvents);
  const { input, output, cacheRead, cacheWrite, cost, subagentCost } =
    tokenStats;
  const lastAssistant = tokenStats.lastAssistant;
  const thinkingLevelFromSession = tokenStats.thinkingLevelFromSession;

  // Calculate context percentage.
  const latestUsage = rt.isStreaming
    ? (rt.liveAssistantUsage ?? lastAssistant?.usage)
    : lastAssistant?.usage;
  const coreContextUsage =
    rt.isStreaming && rt.liveAssistantUsage
      ? null
      : rt.coreContextUsageCache.get(ctx);
  const contextTokens =
    coreContextUsage?.contextTokens ??
    (latestUsage ? getUsageTokenTotal(latestUsage) : 0);
  const contextWindow =
    coreContextUsage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
  const contextPercent =
    coreContextUsage?.contextPercent ??
    (contextWindow > 0 ? (contextTokens / contextWindow) * 100 : 0);

  const segmentOptions = mergeSegmentOptions(
    presetDef.segmentOptions,
    config.segmentOptions,
  );

  // Get git status (cached)
  const gitBranch = rt.footerDataRef?.getGitBranch() ?? null;
  const gitStatus = getGitStatus(gitBranch, segmentOptions.git?.polling);
  const extensionStatuses =
    rt.footerDataRef?.getExtensionStatuses() ?? new Map();
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

  // Check if using OAuth subscription
  const usingSubscription = ctx.model
    ? (ctx.modelRegistry?.isUsingOAuth?.(ctx.model) ?? false)
    : false;

  const thinkingLevel =
    rt.currentThinkingLevel ??
    thinkingLevelFromSession ??
    rt.getThinkingLevelFn?.() ??
    "off";
  const queueSummary = rt.queueStore.summarize(
    getQueueContext(ctx),
    rt.powerlineCompacting,
  );

  return {
    model: ctx.model,
    thinkingLevel,
    sessionId: ctx.sessionManager?.getSessionId?.(),
    cwd: ctx.cwd,
    usageStats: { input, output, cacheRead, cacheWrite, cost, subagentCost },
    contextTokens,
    contextPercent,
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
    tokenBudget: (() => {
      const dailyLimit = parseTokenBudget(
        readSettings(ctx.cwd ?? process.cwd()).wishcraft,
      ).daily;
      const now = Date.now();
      const todayStart = Date.parse(`${dayKey(now)}T00:00:00`);
      const dailyUsed = tokenTotal(
        totalsForRange(loadUsageFileFromDisk(), todayStart, now + 1),
      );
      return { dailyLimit, dailyUsed };
    })(),
    theme,
    colors,
  };
}
