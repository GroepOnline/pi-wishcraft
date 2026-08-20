/**
 * welcome-art.ts
 * ---------------------------------------------------------------------------
 * The welcome overlay's left-column art, as selectable themes:
 *
 *   - "lantern" — a Kongming wish-lantern (wenslantaarn): the detailed
 *     truecolor pixel art from lantern-art.ts, rendered with half-blocks.
 *   - "balloon" — a wish-balloon (wensballon): a hand-drawn hot-air balloon.
 *   - "normal"  — the classic pi mark.
 *
 * `renderWelcomeArt` returns coloured, centred lines ready to drop into the
 * welcome box. The lantern can flicker when `animate` is on.
 * ---------------------------------------------------------------------------
 */

import { ansi } from "../theme/colors.ts";
import { centerText } from "./layout.ts";
import { renderLantern, LANTERN_WIDTH } from "./lantern.ts";

export type WelcomeArtTheme = "lantern" | "balloon" | "normal";

export const WELCOME_ART_THEMES: readonly WelcomeArtTheme[] = [
  "lantern",
  "balloon",
  "normal",
];

export const DEFAULT_WELCOME_ART: WelcomeArtTheme = "lantern";

/** Coerce a settings value to a known theme, falling back to the default. */
export function normalizeWelcomeArt(value: unknown): WelcomeArtTheme {
  return WELCOME_ART_THEMES.includes(value as WelcomeArtTheme)
    ? (value as WelcomeArtTheme)
    : DEFAULT_WELCOME_ART;
}

export interface WelcomeArtOptions {
  /** Time source for the lantern flicker; Date.now() is fine. */
  now?: number;
  /** Animate the lantern flame (lantern theme only). */
  animate?: boolean;
}

// --- Normal: the classic pi mark, warm→cool horizontal gradient -------------

const PI_LOGO = [
  "     . *      ",
  "   * ╭───╮ .  ",
  "  .  │ π │  * ",
  "     │   │    ",
  "   * ╰─┬─╯ .  ",
  "  .    ┴      ",
];

const PI_GRADIENT = [
  "\x1b[38;5;199m",
  "\x1b[38;5;171m",
  "\x1b[38;5;135m",
  "\x1b[38;5;99m",
  "\x1b[38;5;75m",
  "\x1b[38;5;51m",
];

// --- Balloon: a wish-balloon (wensballon), warm→gold vertical gradient ------

const BALLOON_ART = [
  "    ╭───╮    ",
  "   ╱ ✦ ✦ ╲   ",
  "  ╱ ✦ ♥ ✦ ╲  ",
  " │ ✦ ♥ ♥ ✦ │ ",
  " │  ✦ ♥ ✦  │ ",
  "  ╲ ✦ ✦ ✦ ╱  ",
  "   ╲__ __╱   ",
  "    │╲ ╱│    ",
  "    │ ⌂ │    ",
  "    ╰───╯    ",
];

const BALLOON_GRADIENT = [
  "\x1b[38;5;213m",
  "\x1b[38;5;212m",
  "\x1b[38;5;205m",
  "\x1b[38;5;204m",
  "\x1b[38;5;209m",
  "\x1b[38;5;215m",
  "\x1b[38;5;221m",
  "\x1b[38;5;179m",
  "\x1b[38;5;137m",
  "\x1b[38;5;95m",
];

/** Colour a line left-to-right across a palette (non-space cells only). */
function horizontalGradient(line: string, palette: readonly string[]): string {
  let result = "";
  let colorIdx = 0;
  const step = Math.max(1, Math.floor(line.length / palette.length));
  for (let i = 0; i < line.length; i++) {
    if (i > 0 && i % step === 0 && colorIdx < palette.length - 1) colorIdx++;
    const char = line[i]!;
    result += char !== " " ? palette[colorIdx] + char + ansi.reset : char;
  }
  return result;
}

/** Colour a whole row with the palette entry for that row index. */
function rowColor(
  line: string,
  rowIndex: number,
  palette: readonly string[],
): string {
  const color = palette[Math.min(rowIndex, palette.length - 1)]!;
  let result = "";
  for (const char of line) {
    result += char !== " " ? color + char + ansi.reset : char;
  }
  return result;
}

/**
 * Render the chosen art as centred, coloured lines of the given width.
 * Falls back to the pi mark when a themed art cannot fit the column.
 */
export function renderWelcomeArt(
  theme: WelcomeArtTheme,
  width: number,
  opts: WelcomeArtOptions = {},
): string[] {
  if (theme === "lantern") {
    const lantern = renderLantern(
      { now: opts.now ?? 0, still: !opts.animate },
      width,
    );
    if (lantern.length > 0 && LANTERN_WIDTH <= width) {
      return lantern.map((line) => centerText(line, width));
    }
    // too narrow for the pixel art: fall through to the pi mark
  }

  if (theme === "balloon") {
    return BALLOON_ART.map((line, i) =>
      centerText(rowColor(line, i, BALLOON_GRADIENT), width),
    );
  }

  return PI_LOGO.map((line) =>
    centerText(horizontalGradient(line, PI_GRADIENT), width),
  );
}
