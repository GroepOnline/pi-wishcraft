/** Canonical text helpers shared across domains (src/tools is bottom-layer). */

const ANSI_ESCAPE_RE = /\x1b\[[0-9;]*m/g;

/** Strip ANSI SGR sequences only — not OSC8/CSI (see pi-tui's wider variant). */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE_RE, "");
}

/**
 * Remove C0/C1 control characters (including ESC, DEL, newlines) from
 * untrusted text before it reaches the status line — one embedded escape is
 * enough to inject ANSI sequences or break the single-row layout.
 */
export function stripControlChars(text: string): string {
  return text.replace(/[\x00-\x1f\x7f-\x9f]/g, "");
}

export function formatTokens(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1000000) return `${Math.round(n / 1000)}k`;
  if (n < 10000000) return `${(n / 1000000).toFixed(1)}M`;
  return `${Math.round(n / 1000000)}M`;
}

/** Levenshtein distance, bailed out early once it exceeds `max`. */
export function editDistanceWithin(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr.push(Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost));
    }
    if (Math.min(...curr) > max) return false;
    prev = curr;
  }
  return prev[b.length]! <= max;
}
