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

/**
 * Remove C0/C1 control characters (including ESC, DEL, newlines) from
 * untrusted text before it reaches the status line — one embedded escape is
 * enough to inject ANSI sequences or break the single-row layout.
 */
export function stripControlChars(text: string): string {
  return text.replace(/[\x00-\x1f\x7f-\x9f]/g, "");
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
