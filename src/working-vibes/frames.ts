/** Pure working-indicator frames shared by status renderers and tests. */

export type WorkingIndicatorStyle = "dots" | "pulse" | "bar" | "ascii";

const FRAMES: Record<WorkingIndicatorStyle, readonly string[]> = {
  dots: ["·  ", "·· ", "···", " ··", "  ·", " ··"],
  pulse: ["○", "◌", "●", "◌"],
  bar: ["[=  ]", "[== ]", "[===]", "[ ==]", "[  =]"],
  ascii: ["-", "\\", "|", "/"],
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
