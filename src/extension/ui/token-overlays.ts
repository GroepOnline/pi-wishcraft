import type { SelectItem } from "@earendil-works/pi-tui";

import { config } from "../core/state.ts";
import type { RuntimeState } from "../core/types.ts";
import {
  summarizeTpsRing,
  tpsOverlayLines,
  tpsSamples,
} from "../../usage/tps-ring.ts";
import {
  formatUsageOverlayLines,
  loadUsageFileFromDisk,
  summarizeUsageOverlay,
} from "../../usage/usage-store.ts";
import { parseTokenBudget } from "../../usage/token-budget.ts";
import { getSessionTotalCost } from "../../usage/ledger.ts";
import { readSettings } from "../settings/settings-io.ts";
import { showSelectOverlay } from "./overlay-chrome.ts";

function sessionTotals(rt: RuntimeState, ctx: any) {
  const events = rt.sessionBranchCache.get(ctx.sessionManager);
  const snap = rt.tokenStatsCache.get(events);
  return {
    input: snap.input,
    output: snap.output,
    cacheRead: snap.cacheRead,
    cacheWrite: snap.cacheWrite,
    cost: getSessionTotalCost(snap),
  };
}

export function buildTpsOverlayItems(rt: RuntimeState, ctx: any): SelectItem[] {
  const events = rt.sessionBranchCache.get(ctx.sessionManager);
  const snap = rt.tokenStatsCache.get(events);
  const summary = summarizeTpsRing(
    tpsSamples,
    Date.now(),
    { input: snap.input, output: snap.output },
    {
      windowMs: config.segmentOptions?.tps?.windowMs ?? 1000,
      override: process.env.POWERLINE_TPS,
    },
  );
  const lines = tpsOverlayLines(summary);
  return lines.map((line) => ({ label: line, value: line }));
}

export function buildUsageOverlayItems(rt: RuntimeState, ctx: any): SelectItem[] {
  const wishcraft = readSettings(ctx.cwd ?? process.cwd()).wishcraft;
  const budget = parseTokenBudget(wishcraft);
  const summary = summarizeUsageOverlay({
    file: loadUsageFileFromDisk(),
    session: sessionTotals(rt, ctx),
    dailyLimit: budget.daily,
  });
  const lines = formatUsageOverlayLines(summary);
  return lines.map((line) => ({ label: line, value: line }));
}

export async function showTpsOverlay(rt: RuntimeState, ctx: any): Promise<void> {
  const items = buildTpsOverlayItems(rt, ctx);
  const picked = await showSelectOverlay(
    ctx,
    "TPS",
    "same 1s window as the segment · enter copy · esc close",
    items,
    Math.min(items.length, 12),
  );
  if (picked) ctx.ui.notify(picked.value, "info");
}

export async function showUsageOverlay(rt: RuntimeState, ctx: any): Promise<void> {
  const items = buildUsageOverlayItems(rt, ctx);
  const picked = await showSelectOverlay(
    ctx,
    "Usage",
    "today / week from wishcraft-usage.json · enter copy · esc close",
    items,
    Math.min(items.length, 16),
  );
  if (picked) ctx.ui.notify(picked.value, "info");
}
