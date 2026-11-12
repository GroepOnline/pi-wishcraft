/**
 * Color-only motion overlays. CSI is stripped and replaced so a frame
 * never changes visible width.
 */

import { ansi } from "../theme/colors.ts";

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}
import { colorForStyle } from "./style-paint.ts";
import type { MotionIntensity, MotionStyleId } from "./types.ts";

const CSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

export function stripMotionAnsi(text: string): string {
  return text.replace(CSI, "");
}

function fg(r: number, g: number, b: number): string {
  return ansi.getFgAnsi(clampByte(r), clampByte(g), clampByte(b));
}

export function visibleChars(text: string): string[] {
  return [...stripMotionAnsi(text)];
}

function paintChars(
  chars: string[],
  colorAt: (i: number) => [number, number, number] | null,
): string {
  let out = "";
  let painted = false;
  for (const [i, ch] of chars.entries()) {
    if (ch === " ") {
      out += ch;
      continue;
    }
    const rgb = colorAt(i);
    if (rgb === null) {
      // Drop the trailing fg after a painted span, or the rest of the line
      // inherits the last keyword color.
      if (painted) {
        out += ansi.reset;
        painted = false;
      }
      out += ch;
      continue;
    }
    out += `${fg(rgb[0], rgb[1], rgb[2])}${ch}`;
    painted = true;
  }
  return `${out}${ansi.reset}`;
}

export function applyMotionStyle(
  text: string,
  style: MotionStyleId,
  intensity: MotionIntensity,
  now: number,
  speed = 1,
): string {
  if (text.length === 0) return text;
  const chars = visibleChars(text);
  if (chars.length === 0) return text;
  const n = chars.length;
  if (style === "pulse") {
    const rgb = colorForStyle(style, 0, n, now, intensity, speed);
    return paintChars(chars, () => rgb);
  }
  return paintChars(chars, (i) => colorForStyle(style, i, n, now, intensity, speed));
}

/**
 * Recolor a visible-index span. The line is rebuilt from stripped
 * characters (original CSI is not preserved).
 */
export function applyKeywordSpan(
  text: string,
  start: number,
  length: number,
  style: MotionStyleId,
  intensity: MotionIntensity,
  now: number,
  speed = 1,
): string {
  if (length <= 0) return text;
  const chars = visibleChars(text);
  const from = Math.max(0, start);
  const to = Math.min(chars.length, start + length);
  if (from >= to) return text;
  const spanLen = to - from;
  return paintChars(chars, (i) => {
    if (i < from || i >= to) return null;
    return colorForStyle(style, i - from, spanLen, now, intensity, speed);
  });
}
