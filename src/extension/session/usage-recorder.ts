import type { SessionTokenStats } from "../../usage/ledger.ts";
import {
  recordUsageEvent,
  type UsageEvent,
  type UsageTotals,
} from "../../usage/usage-store.ts";
import type { RuntimeState } from "../core/types.ts";

/**
 * Bridge between the session ledger and ~/.pi/agent/wishcraft-usage.json.
 *
 * The file's "today"/"week" columns and the daily budget are spend
 * accounting, so they must count exactly what the status bar bills. Rather
 * than re-deriving billable shapes at the event layer — assistant messages
 * (including billed error/abort turns), toolResult native usage, `usage`
 * entries that fire no event of their own, compaction/branch-summary LLM
 * calls, subagent child cost hidden inside `details.results` — each flush
 * records the delta of the ledger's own totals. Whatever the ledger bills,
 * the file bills, today and as the ledger's accounting widens.
 */

/** Fold ledger totals into the file's shape; cost matches the bar's dollar. */
export function billedSessionTotals(stats: SessionTokenStats): UsageTotals {
  return {
    input: stats.input,
    output: stats.output,
    cacheRead: stats.cacheRead,
    cacheWrite: stats.cacheWrite,
    cost: stats.cost + stats.subagentCost,
  };
}

interface UsageDeltaContext {
  sessionManager?: unknown;
  model?: { id?: string; name?: string } | null;
}

/**
 * Append the billed-usage delta since the previous flush. The first call in
 * a session only adopts the baseline — a resumed session must not dump its
 * history into today's file. Any field regressing means the underlying
 * session file changed underneath us; the new totals become the baseline
 * without recording.
 */
export function recordSessionUsageDelta(
  rt: RuntimeState,
  ctx: UsageDeltaContext,
  record: (event: UsageEvent) => unknown = recordUsageEvent,
): UsageTotals | null {
  const current = billedSessionTotals(
    rt.tokenStatsCache.get(ctx.sessionManager),
  );
  const baseline = rt.sessionUsageBaseline;
  rt.sessionUsageBaseline = current;
  if (baseline === null) return null;

  const delta: UsageTotals = {
    input: current.input - baseline.input,
    output: current.output - baseline.output,
    cacheRead: current.cacheRead - baseline.cacheRead,
    cacheWrite: current.cacheWrite - baseline.cacheWrite,
    cost: current.cost - baseline.cost,
  };
  if (
    delta.input < 0 ||
    delta.output < 0 ||
    delta.cacheRead < 0 ||
    delta.cacheWrite < 0 ||
    delta.cost < 0
  ) {
    return null;
  }
  if (
    delta.input === 0 &&
    delta.output === 0 &&
    delta.cacheRead === 0 &&
    delta.cacheWrite === 0 &&
    delta.cost === 0
  ) {
    return null;
  }

  record({
    at: Date.now(),
    model: ctx.model?.id ?? ctx.model?.name,
    ...delta,
  });
  return delta;
}
