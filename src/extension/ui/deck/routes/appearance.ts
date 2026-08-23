/**
 * src/extension/ui/deck/routes/appearance.ts
 * ---------------------------------------------------------------------------
 * Appearance Route: Presets, Motion Gallery preview, and token customizer.
 * ---------------------------------------------------------------------------
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import type { DeckContext } from "../types.ts";
import { PRESETS } from "../../../../config/presets.ts";
import { MOTION_CATALOG } from "../../../../motion/catalog.ts";

export function renderAppearanceRoute(theme: Theme, ctx: DeckContext, width: number): string[] {
  const lines: string[] = [];

  const dim = (t: string) => theme.fg("dim", t);
  const accent = (t: string) => theme.fg("accent", t);
  const text = (t: string) => theme.fg("text", t);

  lines.push(`  ${theme.bold(text("STRUCTURAL PRESETS (10 SIGNATURE IDENTITIES)"))}`);
  const presetNames = Object.keys(PRESETS).slice(0, 10);
  lines.push(`  ${presetNames.map((p) => p === "lanternwake" ? theme.bold(accent(`[◉ ${p}]`)) : dim(`[◇ ${p}]`)).join("  ")}`);
  lines.push("");

  lines.push(`  ${theme.bold(text("MOTION GALLERY & COMPOSER"))}`);
  const motions = MOTION_CATALOG.slice(0, 6);
  for (const m of motions) {
    lines.push(`  ${accent(m.fallbackGlyph)} ${text(m.name.padEnd(18))} ${dim(`Category: ${m.category.padEnd(12)} Channels: ${m.channels.join(", ")}`)}`);
  }
  lines.push("");
  lines.push(`  ${dim("Press [Enter] to apply preset · [E] to edit motion parameters in Composer")}`);

  return lines;
}
