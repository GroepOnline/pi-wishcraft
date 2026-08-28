/**
 * Transcript v2 (U4). ANSI-aware append: keep color escapes, drop malformed
 * (dangling) SGR sequences, and truncate to a visible-width cap. Width is
 * measured by the upstream `visibleWidth` helper; raw escape bytes are not
 * counted, so a 10-column cap fits roughly 10 visible glyphs even when the
 * underlying byte stream carries escape sequences.
 */

import { visibleWidth } from "@earendil-works/pi-tui";

function stripMalformedSgr(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] === "\x1b" && text[i + 1] === "[") {
      let j = i + 2;
      while (j < text.length && /[0-9;]/.test(text[j] ?? "")) j += 1;
      if (text[j] === "m") {
        out += text.slice(i, j + 1);
      }
      i = j + 1;
      continue;
    }
    out += text[i];
    i += 1;
  }
  return out;
}

function balancedSgr(text: string, maxWidth: number): string {
  const stripped = stripMalformedSgr(text);
  const visible = visibleWidth(stripped);
  if (visible <= maxWidth) return stripped;
  return truncateToVisibleWidth(stripped, maxWidth);
}

function truncateToVisibleWidth(text: string, maxWidth: number): string {
  let visible = "";
  let width = 0;
  let colorActive = false;
  let i = 0;
  while (i < text.length && width < maxWidth) {
    const codePoint = text.codePointAt(i) ?? 0;
    const ch = String.fromCodePoint(codePoint);
    if (ch === "\x1b" && text[i + 1] === "[") {
      let j = i + 2;
      while (j < text.length && /[0-9;]/.test(text[j] ?? "")) j += 1;
      if (text[j] === "m") {
        const seq = text.slice(i, j + 1);
        // Zero-width: keep the sequence at its original position so text
        // before it stays unstyled; only a reset deactivates the format.
        visible += seq;
        colorActive = seq !== "\x1b[0m";
      }
      i = j + 1;
      continue;
    }
    visible += ch;
    // Iterate display units, not UTF-16 code units: wide glyphs advance the
    // cap by their visible width and surrogate pairs are never split.
    width += visibleWidth(ch);
    i += ch.length;
  }
  return colorActive ? `${visible}\x1b[0m` : visible;
}

export function appendColored(
  buf: readonly string[],
  chunk: string,
  maxWidth: number,
): string[] {
  const normalized = chunk.replace(/\r/g, "");
  const lines = normalized.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  const balanced = lines.map((line) => balancedSgr(line, maxWidth));
  return [...buf, ...balanced];
}
