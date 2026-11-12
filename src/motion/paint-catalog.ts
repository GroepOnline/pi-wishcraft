import type { MotionIntensity, MotionStyleId } from "./types.ts";

export const THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export const MOTION_PAINT_CATALOG = [
  { id: "ember-relay", name: "Ember Relay", style: "ember", intensity: 3, speed: 1.05, description: "Warm trail along the bar while work is happening." },
  { id: "lanternwake", name: "Lanternwake", style: "ember", intensity: 4, speed: 1.2, description: "Kongming signature: gold on paper-red." },
  { id: "wisp", name: "Wisp", style: "pulse", intensity: 1, speed: 0.45, description: "Soft brightness breathe." },
  { id: "shimmer-work", name: "Shimmer Work", style: "shimmer", intensity: 2, speed: 1.05, description: "Codex-like traveling highlight on Working." },
  { id: "rainbow-ultra", name: "Rainbow Ultra", style: "rainbow", intensity: 5, speed: 1.85, description: "Claude ultrathink / Codex Ultra chase." },
  { id: "heat-bloom", name: "Heat Bloom", style: "heat", intensity: 4, speed: 1.28, description: "Red-amber lift for think harder." },
  { id: "aurora-nimbus", name: "Aurora Nimbus", style: "aurora", intensity: 3, speed: 0.55, description: "Slow cyan-green wash." },
  { id: "comet-tail", name: "Comet Tail", style: "comet", intensity: 4, speed: 1.95, description: "Tight head, long tail." },
  { id: "prism-split", name: "Prism Split", style: "prism", intensity: 3, speed: 0.95, description: "Split complementary bands." },
  { id: "tide-rise", name: "Tide Rise", style: "tide", intensity: 3, speed: 0.68, description: "Bidirectional breathe." },
  { id: "pulse-quiet", name: "Pulse Quiet", style: "pulse", intensity: 2, speed: 0.58, description: "Whole-line brightness, low drama." },
  { id: "forge-heat", name: "Forge Heat", style: "heat", intensity: 5, speed: 1.55, description: "Crucible / blaze." },
  { id: "nova-burst", name: "Nova Burst", style: "rainbow", intensity: 5, speed: 2.1, description: "Short high-speed rainbow." },
  { id: "stitch-travel", name: "Stitch Travel", style: "shimmer", intensity: 2, speed: 0.82, description: "Dashed gold stitch." },
  { id: "helix-spin", name: "Helix Spin", style: "prism", intensity: 3, speed: 1.38, description: "Twisted complementary helix." },
  { id: "copper-switch", name: "Copper Switch", style: "ember", intensity: 2, speed: 0.72, description: "Quieter copper chase." },
  { id: "rune-flare", name: "Rune Flare", style: "heat", intensity: 3, speed: 1.12, description: "Local flare, not a spinner." },
  { id: "storm-front", name: "Storm Front", style: "comet", intensity: 4, speed: 1.72, description: "Fast indigo front." },
  { id: "vigil-hush", name: "Vigil Hush", style: "pulse", intensity: 1, speed: 0.4, description: "Night-shift pulse." },
  { id: "warp-fold", name: "Warp Fold", style: "prism", intensity: 4, speed: 1.68, description: "Hard prism fold." },
  { id: "gold-chase", name: "Gold Chase", style: "shimmer", intensity: 4, speed: 1.42, description: "Hotter shimmer." },
  { id: "magenta-wake", name: "Magenta Wake", style: "ember", intensity: 3, speed: 1.08, description: "Wishcraft magenta-gold mix." },
  { id: "cyan-drift", name: "Cyan Drift", style: "aurora", intensity: 2, speed: 0.48, description: "Idle-adjacent drift." },
  { id: "ember-gust", name: "Ember Gust", style: "ember", intensity: 4, speed: 1.62, description: "Faster lantern gust." },
  { id: "think-hard", name: "Think Hard", style: "ember", intensity: 3, speed: 1, description: "Claude think hard." },
  { id: "think-harder", name: "Think Harder", style: "heat", intensity: 4, speed: 1.22, description: "Claude think harder." },
  { id: "ultrathink", name: "Ultrathink", style: "rainbow", intensity: 5, speed: 1.95, description: "Claude ultrathink rainbow." },
  { id: "max-effort", name: "Max Effort", style: "rainbow", intensity: 5, speed: 1.78, description: "Codex max / xhigh." },
  { id: "wish-rise", name: "Wish Rise", style: "ember", intensity: 2, speed: 0.78, description: "Soft wish lift." },
  { id: "zenith", name: "Zenith", style: "rainbow", intensity: 4, speed: 1.48, description: "High but not nova." },
] as const satisfies ReadonlyArray<{
  id: string;
  name: string;
  style: MotionStyleId;
  intensity: MotionIntensity;
  speed: number;
  description: string;
}>;

export type MotionPaintEntry = (typeof MOTION_PAINT_CATALOG)[number];
export type MotionPaintId = MotionPaintEntry["id"];

export const MOTION_PAINT_CATALOG_COUNT = MOTION_PAINT_CATALOG.length;

const CATALOG_BY_ID = Object.fromEntries(
  MOTION_PAINT_CATALOG.map((entry) => [entry.id, entry]),
) as Record<MotionPaintId, MotionPaintEntry>;

export function parseThinkingLevel(
  raw: string | null | undefined,
): ThinkingLevel | null {
  if (raw == null) return null;
  for (const level of THINKING_LEVELS) {
    if (raw === level) return level;
  }
  return null;
}

export function isMotionPaintId(id: string): id is MotionPaintId {
  return Object.hasOwn(CATALOG_BY_ID, id);
}

export function getMotionPaintEntry(id: MotionPaintId): MotionPaintEntry {
  return CATALOG_BY_ID[id];
}

export function thinkingMotion(
  level: Exclude<ThinkingLevel, "off">,
): MotionPaintEntry;
export function thinkingMotion(level: "off"): null;
export function thinkingMotion(level: ThinkingLevel): MotionPaintEntry | null;
export function thinkingMotion(level: ThinkingLevel): MotionPaintEntry | null {
  switch (level) {
    case "minimal":
    case "low":
      return getMotionPaintEntry("wisp");
    case "medium":
      return getMotionPaintEntry("shimmer-work");
    case "high":
      return getMotionPaintEntry("ember-relay");
    case "xhigh":
    case "max":
      return getMotionPaintEntry("rainbow-ultra");
    case "off":
      return null;
    default: {
      const _exhaustive: never = level;
      return _exhaustive;
    }
  }
}
