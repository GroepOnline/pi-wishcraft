/**
 * src/extension/ui/deck/routes/home.ts
 * ---------------------------------------------------------------------------
 * Home Route for Wishcraft Deck: living session state, context bar, intent.
 * ---------------------------------------------------------------------------
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { DeckContext } from "../types.ts";

export function renderHomeRoute(theme: Theme, ctx: DeckContext, width: number): string[] {
  const innerW = Math.max(1, width - 4);
  const lines: string[] = [];

  const dim = (t: string) => theme.fg("dim", t);
  const accent = (t: string) => theme.fg("accent", t);
  const success = (t: string) => theme.fg("success", t);
  const text = (t: string) => theme.fg("text", t);

  // Left col: Session / Context / Next Intent
  // Right col: Activity Feed / Skills Health
  const pct = Math.min(100, Math.max(0, ctx.sessionState.contextPct));
  const filledBars = Math.round((pct / 100) * 16);
  const emptyBars = Math.max(0, 16 - filledBars);
  const bar = `${theme.fg("accent", "█".repeat(filledBars))}${theme.fg("dim", "░".repeat(emptyBars))}`;

  lines.push(`  ${theme.bold(text("SESSION OVERVIEW"))}`);
  lines.push(`  ${theme.fg("accent", "◆")} Status: ${accent(ctx.sessionState.activityStatus)}  ${dim(`(Model: ${ctx.sessionState.model})`)}`);
  lines.push(`  ${dim("━━━━╾✦╼━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")}`);
  lines.push("");
  lines.push(`  ${theme.bold(text("CONTEXT CAPACITY"))}`);
  lines.push(`  ${bar} ${text(`${pct}%`)}`);
  lines.push("");
  lines.push(`  ${theme.bold(text("NEXT INTENT / OPERATOR ACTION"))}`);
  lines.push(`  ${text("Live operator layer active. Use [Tab] to navigate, [/] to search.")}`);
  lines.push(`  ${theme.fg("muted", "[Enter Execute]   [g s Skills]   [g i Ideas]   [g a Appearance]")}`);
  lines.push("");

  return lines;
}
