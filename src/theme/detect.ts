/**
 * Terminal and host capability detection. Pure: reads an env map, no process
 * globals except the default argument. Motion policy is assembled elsewhere
 * so this file stays free of the motion engine.
 */

export interface TerminalEnvironment {
  noColor: boolean;
  lowColor: boolean;
  screenReader: boolean;
  reducedMotion: boolean;
  dumb: boolean;
}

const MOTION_LEVELS = ["full", "reduced", "functional", "off"] as const;

export function detectEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): TerminalEnvironment {
  const term = (env.TERM ?? "").toLowerCase();
  const colorterm = (env.COLORTERM ?? "").toLowerCase();
  const noColor = env.NO_COLOR !== undefined && env.NO_COLOR !== "";
  const dumb = term === "dumb" || term === "";
  const lowColor =
    !colorterm.includes("truecolor") &&
    !colorterm.includes("24bit") &&
    (term.includes("vt100") || term === "linux" || /\bansi\b/.test(term));
  const screenReader =
    env.WISHCRAFT_SCREEN_READER === "1" ||
    env.ACCESSIBILITY_SCREEN_READER === "1" ||
    env.NVDA !== undefined ||
    env.VOICEOVER === "1";
  const reducedMotion =
    env.WISHCRAFT_REDUCED_MOTION === "1" ||
    env.PREFER_REDUCED_MOTION === "1" ||
    env.MOZ_PREFER_REDUCED_MOTION === "1";

  return { noColor, lowColor: lowColor && !noColor, screenReader, reducedMotion, dumb };
}

export function motionLevelFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): (typeof MOTION_LEVELS)[number] | null {
  const raw = (env.WISHCRAFT_MOTION ?? "").toLowerCase();
  return (MOTION_LEVELS as readonly string[]).includes(raw)
    ? (raw as (typeof MOTION_LEVELS)[number])
    : null;
}
