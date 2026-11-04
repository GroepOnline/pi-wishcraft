/** Pure working-indicator frames shared by status renderers and tests. */

export type WorkingIndicatorStyle =
  | "dots"
  | "pulse"
  | "bar"
  | "ascii"
  | "lantern"
  | "braille";

const FRAMES: Record<WorkingIndicatorStyle, readonly string[]> = {
  dots: ["·  ", "·· ", "···", " ··", "  ·", " ··"],
  pulse: ["○", "◌", "●", "◌"],
  bar: ["[=  ]", "[== ]", "[===]", "[ ==]", "[  =]"],
  ascii: ["-", "\\", "|", "/"],
  lantern: ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█", "▇", "▆", "▅", "▄", "▃", "▂"],
  braille: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
};

const NATIVE_INTERVAL_MS: Record<WorkingIndicatorStyle, number> = {
  dots: 140,
  pulse: 160,
  bar: 120,
  ascii: 100,
  lantern: 90,
  braille: 80,
};

export function workingIndicatorFrame(
  style: WorkingIndicatorStyle = "dots",
  tick = 0,
  motion: "full" | "reduced" | "functional" | "off" = "full",
): string {
  const frames = FRAMES[style] ?? FRAMES.dots;
  if (motion === "off" || motion === "reduced") return frames[0]!;
  if (motion === "functional") return frames[tick % 2 === 0 ? 0 : Math.min(1, frames.length - 1)]!;
  return frames[Math.abs(Math.floor(tick)) % frames.length]!;
}

export function workingIndicatorStyles(): WorkingIndicatorStyle[] {
  return Object.keys(FRAMES) as WorkingIndicatorStyle[];
}

/** Every glyph any style can draw, for stripping spinner noise from captured text. */
export function allWorkingIndicatorFrames(): string[] {
  return Object.values(FRAMES).flatMap((frames) => [...frames]);
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
): { frames: string[]; intervalMs: number } {
  const key: WorkingIndicatorStyle = ascii ? "ascii" : (style in FRAMES ? style : "dots");
  const frames = FRAMES[key];
  if (motion === "off" || motion === "reduced") {
    return { frames: [frames[0]!], intervalMs: 1000 };
  }
  if (motion === "functional") {
    return { frames: [frames[0]!, frames[Math.min(1, frames.length - 1)]!], intervalMs: 500 };
  }
  return { frames: [...frames], intervalMs: NATIVE_INTERVAL_MS[key] };
}
