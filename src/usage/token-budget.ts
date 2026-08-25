/**
 * wishcraft.tokenBudget.daily — colours the cost segment and warns in
 * welcome at 80%/100%. Never blocks a turn.
 */

export interface TokenBudget {
  daily: number | null;
}

export interface TokenBudgetLevel {
  ratio: number;
  level: 0 | 80 | 100;
}

export interface TokenBudgetSnapshot {
  day: string;
  dailyLimit: number | null;
  dailyUsed: number;
}

export function parseTokenBudget(wishcraftSettings: unknown): TokenBudget {
  if (!wishcraftSettings || typeof wishcraftSettings !== "object") {
    return { daily: null };
  }
  const rec = wishcraftSettings as Record<string, unknown>;
  const nested =
    rec.tokenBudget && typeof rec.tokenBudget === "object" && !Array.isArray(rec.tokenBudget)
      ? (rec.tokenBudget as Record<string, unknown>)
      : rec;
  const raw = nested.daily;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    return { daily: null };
  }
  return { daily: Math.round(raw) };
}

export function tokenBudgetLevel(used: number, daily: number | null): TokenBudgetLevel {
  if (!daily || daily <= 0 || used < 0) return { ratio: 0, level: 0 };
  const ratio = used / daily;
  if (ratio >= 1) return { ratio, level: 100 };
  if (ratio >= 0.8) return { ratio, level: 80 };
  return { ratio, level: 0 };
}

/**
 * Return the budget visible for a local day. A long-lived session that crosses
 * midnight must never carry yesterday's usage into the new day; the next
 * lifecycle refresh will repopulate usage from disk after a new usage event.
 */
export function tokenBudgetSnapshotForDay(
  snapshot: TokenBudgetSnapshot,
  day: string,
): TokenBudgetSnapshot {
  if (snapshot.day === day) return snapshot;
  return {
    day,
    dailyLimit: snapshot.dailyLimit,
    dailyUsed: 0,
  };
}

export function formatTokenBudgetWarning(
  used: number,
  daily: number,
  level: 80 | 100,
): string {
  const pct = Math.round((used / daily) * 100);
  if (level === 100) {
    return `Daily token budget reached (${pct}% of ${daily})`;
  }
  return `Daily token budget at ${pct}% of ${daily}`;
}

export function costColorForBudget(
  level: TokenBudgetLevel["level"],
): "cost" | "contextWarn" | "contextError" {
  if (level === 100) return "contextError";
  if (level === 80) return "contextWarn";
  return "cost";
}
