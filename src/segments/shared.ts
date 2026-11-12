import type { SegmentContext, SemanticColor } from "../config/types.ts";
import { fg } from "../theme/theme.ts";

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

export function color(
  ctx: SegmentContext,
  semantic: SemanticColor,
  text: string,
): string {
  return fg(ctx.theme, semantic, text, ctx.colors);
}

export function withIcon(icon: string, text: string): string {
  return icon ? `${icon} ${text}` : text;
}

export { formatTokens } from "../tools/text.ts";

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m${seconds % 60}s`;
  return `${seconds}s`;
}
