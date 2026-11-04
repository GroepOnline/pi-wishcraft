/** Pure working-indicator frames shared by status renderers and tests. */

const FRAMES = {
  dots: ["·  ", "·· ", "···", " ··", "  ·", " ··"],
  pulse: ["○", "◌", "●", "◌"],
  bar: ["[=  ]", "[== ]", "[===]", "[ ==]", "[  =]"],
  ascii: ["-", "\\", "|", "/"],
  lantern: ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█", "▇", "▆", "▅", "▄", "▃", "▂"],
  braille: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
} as const satisfies Record<string, readonly string[]>;

/** Styles with a fixed frame table of their own. */
export type BuiltinIndicatorStyle = keyof typeof FRAMES;

/**
 * `motion` is not a frame table: it borrows the frames of whichever MotionDef
 * the Motion Catalog is running (see `src/motion/catalog.ts`), falling back to
 * the lantern ramp when no catalog frame is supplied.
 */
export type WorkingIndicatorStyle = BuiltinIndicatorStyle | "motion";

/** Frames `motion` falls back to when the caller has no MotionDef. */
export const MOTION_STYLE_FALLBACK: BuiltinIndicatorStyle = "lantern";

const NATIVE_INTERVAL_MS: Record<BuiltinIndicatorStyle, number> = {
  dots: 140,
  pulse: 160,
  bar: 120,
  ascii: 100,
  lantern: 90,
  braille: 80,
};

/** Fixed frames for a style; `motion` resolves to the lantern ramp. */
export function framesForStyle(
  style: WorkingIndicatorStyle = "dots",
): readonly string[] {
  if (style === "motion") return FRAMES[MOTION_STYLE_FALLBACK];
  return FRAMES[style] ?? FRAMES.dots;
}

export function workingIndicatorFrame(
  style: WorkingIndicatorStyle = "dots",
  tick = 0,
  motion: "full" | "reduced" | "functional" | "off" = "full",
): string {
  const frames = framesForStyle(style);
  if (motion === "off" || motion === "reduced") return frames[0]!;
  if (motion === "functional") return frames[tick % 2 === 0 ? 0 : Math.min(1, frames.length - 1)]!;
  return frames[Math.abs(Math.floor(tick)) % frames.length]!;
}

export function workingIndicatorStyles(): WorkingIndicatorStyle[] {
  return [...(Object.keys(FRAMES) as BuiltinIndicatorStyle[]), "motion"];
}

/** Every glyph any style can draw, for stripping spinner noise from captured text. */
export function allWorkingIndicatorFrames(): string[] {
  return Object.values(FRAMES).flatMap((frames) => [...frames]);
}

export interface NativeIndicatorSpec {
  frames: string[];
  intervalMs: number;
}

/** Interval of a built-in style, or of the supplied catalog motion. */
function nativeInterval(
  style: WorkingIndicatorStyle,
  catalog?: NativeIndicatorSpec,
): number {
  if (style === "motion") {
    return catalog?.intervalMs ?? NATIVE_INTERVAL_MS[MOTION_STYLE_FALLBACK];
  }
  return NATIVE_INTERVAL_MS[style] ?? NATIVE_INTERVAL_MS.dots;
}

/**
 * Options for Pi's native `ctx.ui.setWorkingIndicator`. Pi owns the timer, so
 * this is set once per run (not per tick): full motion animates every frame,
 * functional motion alternates two frames slowly, reduced/off hold one frame.
 */
export function nativeWorkingIndicator(
  style: WorkingIndicatorStyle = "dots",
  motion: "full" | "reduced" | "functional" | "off" = "full",
  ascii = false,
  /** Frames + cadence of the active MotionDef, used by the `motion` style. */
  catalog?: NativeIndicatorSpec,
): NativeIndicatorSpec {
  const key: WorkingIndicatorStyle = ascii ? "ascii" : style;
  const source =
    key === "motion" && catalog?.frames.length ? catalog.frames : framesForStyle(key);
  const frames = source.length > 0 ? [...source] : ["·"];
  if (motion === "off" || motion === "reduced") {
    return { frames: [frames[0]!], intervalMs: 1000 };
  }
  if (motion === "functional") {
    return { frames: [frames[0]!, frames[Math.min(1, frames.length - 1)]!], intervalMs: 500 };
  }
  return { frames, intervalMs: nativeInterval(key, catalog) };
}
