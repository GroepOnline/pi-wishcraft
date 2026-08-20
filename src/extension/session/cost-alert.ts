import type { CostCurrencyCode } from "../../usage/rates.ts";
import { formatUsdCost } from "../../usage/rates.ts";

/**
 * Decide whether the once-per-session cost alert should fire. Pure and
 * side-effect free so it can be unit-tested without a running session.
 */
export function shouldTriggerCostAlert(options: {
  totalCost: number;
  threshold: number | null | undefined;
  alreadyNotified: boolean;
}): boolean {
  const { totalCost, threshold, alreadyNotified } = options;
  if (alreadyNotified) return false;
  if (
    typeof threshold !== "number" ||
    !Number.isFinite(threshold) ||
    threshold <= 0
  ) {
    return false;
  }
  return totalCost >= threshold;
}

/** Format the one-line warning shown when the session crosses the threshold. */
export function formatCostAlertMessage(
  totalCostUsd: number,
  thresholdUsd: number,
  currency: CostCurrencyCode = "USD",
): string {
  const total =
    formatUsdCost(totalCostUsd, currency) ?? `$${totalCostUsd.toFixed(2)}`;
  const threshold =
    formatUsdCost(thresholdUsd, currency) ?? `$${thresholdUsd.toFixed(2)}`;
  return `Session cost reached ${total} (alert threshold ${threshold})`;
}
