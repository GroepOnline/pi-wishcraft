/**
 * policy.ts
 * ---------------------------------------------------------------------------
 * Accessibility and performance policy for motion. Pure functions: the
 * scheduler asks which channels may run, how fast, and whether a frame is
 * worth painting at all.
 * ---------------------------------------------------------------------------
 */

import { CADENCE_MS, CHANNEL_MATRIX, PREVIEW_INTERVAL_MS } from "./catalog.ts";
import type { MotionChannel, MotionEvent, MotionLevel, MotionPolicy, MotionToggles } from "./types.ts";

const CHANNEL_TOGGLE: Record<MotionChannel, keyof MotionToggles> = {
  workingGlyph: "state",
  signal: "signal",
  deckTransient: "transitions",
  panelIndicator: "state",
  borderEmphasis: "transitions",
  ambient: "ambient",
};

/**
 * Channels an event is allowed to drive under the current policy.
 *
 * - screen-reader mode and level "off" allow nothing
 * - "functional" keeps only the channels that report state
 * - "reduced" drops continuous sweeps and decorative ambient
 * - a reduced-motion host preference behaves like "reduced" unless the user
 *   explicitly asked for full motion
 */
export function allowedChannels(
  event: MotionEvent,
  policy: MotionPolicy,
): MotionChannel[] {
  if (policy.screenReader || policy.level === "off") return [];

  const effective = effectiveLevel(policy);
  return CHANNEL_MATRIX[event].filter((channel) => {
    if (effective === "functional") {
      return channel === "workingGlyph" || channel === "panelIndicator";
    }
    if (effective === "reduced") {
      if (channel === "ambient" || channel === "signal") return false;
    }
    return policy.toggles[CHANNEL_TOGGLE[channel]];
  });
}

/** A reduced-motion host preference downgrades full motion, never upgrades it. */
export function effectiveLevel(policy: MotionPolicy): MotionLevel {
  if (policy.level === "off" || policy.screenReader) return "off";
  if (policy.reducedMotion && policy.level === "full") return "reduced";
  return policy.level;
}

export function cadenceFor(
  channel: MotionChannel,
  policy: MotionPolicy,
  preview = false,
): number {
  if (preview) return PREVIEW_INTERVAL_MS;
  const range = CADENCE_MS[channel];
  if (effectiveLevel(policy) === "reduced") return range.max;
  return Math.round((range.min + range.max) / 2);
}

/**
 * Frames per second the shared scheduler should aim for.
 *
 * `consumers` are the channels something is actually subscribed to. An event
 * that permits a channel nobody renders still costs 0 FPS.
 */
export function targetFps(
  policy: MotionPolicy,
  allowed: readonly MotionChannel[],
  consumers?: readonly MotionChannel[],
): number {
  if (policy.screenReader || policy.level === "off") return 0;
  const live = consumers
    ? allowed.filter((channel) => consumers.includes(channel))
    : allowed;
  if (live.length === 0) return 0;
  if (live.length === 1 && live[0] === "ambient") return 3;
  if (effectiveLevel(policy) === "reduced") return 3;
  return 10;
}

/** Color transitions are suppressed without color; glyph motion may stay. */
export function allowsColorTransition(policy: MotionPolicy): boolean {
  return !policy.noColor && !policy.screenReader && policy.level !== "off";
}

/** Glyph motion falls back to ASCII when Nerd glyphs are unavailable. */
export function prefersAsciiGlyphs(policy: MotionPolicy, hasNerdFonts: boolean): boolean {
  return !hasNerdFonts || policy.lowColor;
}

/** Stable status text used when motion is off or a screen reader is active. */
export function describeMotionEvent(event: MotionEvent, tool?: string): string {
  switch (event) {
    case "idle":
      return "idle";
    case "thinking":
      return "thinking";
    case "streaming":
      return "streaming";
    case "tool.start":
      return tool ? `running ${tool}` : "running tool";
    case "tool.end":
      return tool ? `${tool} done` : "tool done";
    case "idea.capture":
      return "idea captured";
    case "skill.insert":
      return "skill inserted";
    case "policy.deny":
      return "blocked by policy";
    case "repair":
      return "repairing";
    case "compact":
      return "compacting context";
    case "success":
      return "success";
    case "warning":
      return "warning";
    case "error":
      return "error";
  }
}
