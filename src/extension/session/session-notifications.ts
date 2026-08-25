import { getSessionTotalCost } from "../../usage/ledger.ts";
import {
  formatTokenBudgetWarning,
  parseTokenBudget,
  tokenBudgetLevel,
} from "../../usage/token-budget.ts";
import {
  dayKey,
  loadUsageFileFromDisk,
  tokenTotal,
  totalsForRange,
} from "../../usage/usage-store.ts";
import { config } from "../core/state.ts";
import type { RuntimeState } from "../core/types.ts";
import { readSettings } from "../settings/settings-io.ts";
import {
  formatCostAlertMessage,
  shouldTriggerCostAlert,
} from "./cost-alert.ts";

/** Notify once when the configured per-session cost threshold is crossed. */
export function maybeNotifyCostAlert(rt: RuntimeState, ctx: any): void {
  if (!ctx?.hasUI || rt.costAlertNotified) return;
  const threshold = config.costAlert;
  const sessionEvents = rt.sessionBranchCache.get(ctx.sessionManager);
  const totalCost = getSessionTotalCost(rt.tokenStatsCache.get(sessionEvents));
  if (
    !shouldTriggerCostAlert({
      totalCost,
      threshold,
      alreadyNotified: rt.costAlertNotified,
    })
  ) {
    return;
  }

  rt.costAlertNotified = true;
  ctx.ui.notify(
    formatCostAlertMessage(
      totalCost,
      threshold as number,
      config.segmentOptions?.cost?.currency ?? "USD",
    ),
    "warning",
  );
}

/**
 * Refresh disk-backed budget data at lifecycle boundaries, never during paint.
 * A local-day rollover also resets the per-day warning latch.
 */
export function refreshTokenBudgetSnapshot(
  rt: RuntimeState,
  ctx: any,
  settings?: ReturnType<typeof readSettings>,
): { daily: number | null; used: number; level: 0 | 80 | 100 } {
  const now = Date.now();
  const day = dayKey(now);
  if (rt.tokenBudgetSnapshot.day !== day) {
    rt.tokenBudgetNotifiedLevel = 0;
  }

  const resolvedSettings = settings ?? readSettings(ctx.cwd ?? process.cwd());
  const daily = parseTokenBudget(resolvedSettings.wishcraft).daily;
  if (!daily) {
    rt.tokenBudgetSnapshot = { day, dailyLimit: null, dailyUsed: 0 };
    return { daily: null, used: 0, level: 0 };
  }

  const todayStart = Date.parse(`${day}T00:00:00`);
  const used = tokenTotal(
    totalsForRange(loadUsageFileFromDisk(), todayStart, now + 1),
  );
  rt.tokenBudgetSnapshot = { day, dailyLimit: daily, dailyUsed: used };
  const { level } = tokenBudgetLevel(used, daily);
  return { daily, used, level };
}

/** Refresh the daily budget and emit its 80%/100% warning at most once per day. */
export function maybeNotifyTokenBudget(
  rt: RuntimeState,
  ctx: any,
  settings?: ReturnType<typeof readSettings>,
): void {
  if (!ctx?.hasUI) return;
  const { daily, used, level } = refreshTokenBudgetSnapshot(rt, ctx, settings);
  if (!daily || level === 0 || level <= rt.tokenBudgetNotifiedLevel) return;

  rt.tokenBudgetNotifiedLevel = level;
  ctx.ui.notify(formatTokenBudgetWarning(used, daily, level), "warning");
}