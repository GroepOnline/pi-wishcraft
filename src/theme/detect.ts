/**
 * Terminal capability detection. Pure over an env map so tests do not need a
 * real TTY. `TERM=screen` is GNU Screen, not a screen reader.
 */

export interface TerminalCapabilities {
  noColor: boolean;
  term: string;
  colorterm: string;
  dumb: boolean;
  truecolor: boolean;
  color256: boolean;
  lowColor: boolean;
  screenReader: boolean;
  reducedMotion: boolean;
  asciiPreferred: boolean;
}

export function detectNoColor(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.NO_COLOR;
  return value != null && value !== "";
}

export function detectTerminalCapabilities(
  env: NodeJS.ProcessEnv = process.env,
): TerminalCapabilities {
  const term = env.TERM ?? "";
  const colorterm = env.COLORTERM ?? "";
  const noColor = detectNoColor(env);
  const dumb = term === "dumb" || term === "";
  const truecolor = /truecolor|24bit/i.test(colorterm);
  const color256 =
    !dumb &&
    (truecolor || /256color/i.test(term) || /256/.test(colorterm));
  const lowColor =
    dumb ||
    (!truecolor &&
      !color256 &&
      /^(linux|ansi|vt100|vt220|cygwin)$/i.test(term));
  const screenReader =
    env.WISHCRAFT_SCREEN_READER === "1" ||
    env.ACCESSIBILITY_SCREEN_READER === "1";
  const reducedMotion =
    env.WISHCRAFT_REDUCED_MOTION === "1" || env.PREFERS_REDUCED_MOTION === "1";
  const asciiPreferred =
    dumb || env.POWERLINE_NERD_FONTS === "0" || lowColor;

  return {
    noColor,
    term,
    colorterm,
    dumb,
    truecolor,
    color256,
    lowColor,
    screenReader,
    reducedMotion,
    asciiPreferred,
  };
}
