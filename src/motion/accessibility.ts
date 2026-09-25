/**
 * First-class accessibility policy. Environment flags plus an optional
 * persisted motion level become a MotionPolicy the scheduler already understands.
 */

import { detectEnvironment, motionLevelFromEnv } from "../theme/detect.ts";
import { describeMotionEvent, effectiveLevel, targetFps } from "./policy.ts";
import {
  DEFAULT_MOTION_POLICY,
  type MotionEvent,
  type MotionLevel,
  type MotionPolicy,
} from "./types.ts";

export type { MotionLevel, MotionPolicy };

export const MOTION_LEVELS: readonly MotionLevel[] = [
  "full",
  "reduced",
  "functional",
  "off",
];

export function isMotionLevel(value: unknown): value is MotionLevel {
  return typeof value === "string" && (MOTION_LEVELS as readonly string[]).includes(value);
}

/**
 * Build a policy from the host environment, then overlay a saved level.
 * Screen-reader mode always forces off. An explicit WISHCRAFT_MOTION env
 * wins over the saved level.
 */
export function policyFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
  persistedLevel?: MotionLevel,
): MotionPolicy {
  const detected = detectEnvironment(env);
  const fromEnv = motionLevelFromEnv(env);
  let level: MotionLevel = fromEnv ?? persistedLevel ?? "full";
  if (detected.screenReader) level = "off";
  return {
    level,
    toggles: { ...DEFAULT_MOTION_POLICY.toggles },
    noColor: detected.noColor,
    lowColor: detected.lowColor || detected.dumb,
    screenReader: detected.screenReader,
    reducedMotion: detected.reducedMotion,
  };
}

/** Idle FPS for the current policy with no consumers must be 0. */
export function idleFps(policy: MotionPolicy): number {
  return targetFps(policy, [], []);
}

/** Stable one-line status for screen readers. No glyphs, no motion. */
export function screenReaderStatus(input: {
  model: string;
  git: string;
  event: MotionEvent;
  activity?: string;
  contextPercent: number;
  tool?: string;
}): string {
  const state = input.activity?.trim() || describeMotionEvent(input.event, input.tool);
  return `Model: ${input.model} | Git: ${input.git} | State: ${state} | Context: ${input.contextPercent}%`;
}

export function describeMotionLevel(level: MotionLevel): string {
  switch (level) {
    case "full":
      return "Continuous sweeps, micro-spinners, and transitions";
    case "reduced":
      return "Instant state changes; continuous loops replaced by static glyphs";
    case "functional":
      return "Task indicators active; decorative ambient motion disabled";
    case "off":
      return "Static display; zero animated frames";
    default: {
      const exhaustive: never = level;
      return exhaustive;
    }
  }
}

export function describePolicy(policy: MotionPolicy): string {
  const level = effectiveLevel(policy);
  const bits = [`motion ${level}`];
  if (policy.noColor) bits.push("NO_COLOR");
  if (policy.lowColor) bits.push("low-color");
  if (policy.screenReader) bits.push("screen-reader");
  if (policy.reducedMotion) bits.push("reduced-motion host");
  return bits.join(" · ");
}
