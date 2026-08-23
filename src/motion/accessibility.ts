/**
 * First-class accessibility: environment → policy → render decisions.
 * Motion levels and degradation flags change real output, not just comments.
 */

import { detectTerminalCapabilities } from "../theme/detect.ts";
import {
  allowedChannels,
  describeMotionEvent,
  effectiveLevel,
} from "./policy.ts";
import {
  DEFAULT_MOTION_POLICY,
  type MotionEvent,
  type MotionLevel,
  type MotionPolicy,
  type MotionToggles,
} from "./types.ts";

const LEVELS: readonly MotionLevel[] = ["full", "reduced", "functional", "off"];

export function isMotionLevel(value: unknown): value is MotionLevel {
  return typeof value === "string" && (LEVELS as readonly string[]).includes(value);
}

export function parseMotionSettings(wishcraft: unknown): Partial<MotionPolicy> {
  if (!wishcraft || typeof wishcraft !== "object" || Array.isArray(wishcraft)) {
    return {};
  }
  const root = wishcraft as Record<string, unknown>;
  const motion = root.motion;
  const source =
    motion && typeof motion === "object" && !Array.isArray(motion)
      ? (motion as Record<string, unknown>)
      : root;
  const next: Partial<MotionPolicy> = {};
  if (isMotionLevel(source.level)) next.level = source.level;
  if (typeof source.screenReader === "boolean") next.screenReader = source.screenReader;
  if (typeof source.reducedMotion === "boolean") next.reducedMotion = source.reducedMotion;
  if (typeof source.noColor === "boolean") next.noColor = source.noColor;
  if (typeof source.lowColor === "boolean") next.lowColor = source.lowColor;
  if (source.toggles && typeof source.toggles === "object" && !Array.isArray(source.toggles)) {
    const toggles = source.toggles as Record<string, unknown>;
    const parsed: Partial<MotionToggles> = {};
    for (const key of ["ambient", "state", "transitions", "signal", "cursor"] as const) {
      if (typeof toggles[key] === "boolean") parsed[key] = toggles[key];
    }
    if (Object.keys(parsed).length > 0) {
      next.toggles = { ...DEFAULT_MOTION_POLICY.toggles, ...parsed };
    }
  }
  return next;
}

export function motionPolicyFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
  overrides: Partial<MotionPolicy> = {},
): MotionPolicy {
  const caps = detectTerminalCapabilities(env);
  return {
    ...DEFAULT_MOTION_POLICY,
    ...overrides,
    level: overrides.level ?? DEFAULT_MOTION_POLICY.level,
    toggles: { ...DEFAULT_MOTION_POLICY.toggles, ...overrides.toggles },
    noColor: overrides.noColor ?? caps.noColor,
    lowColor: overrides.lowColor ?? caps.lowColor,
    screenReader: overrides.screenReader ?? caps.screenReader,
    reducedMotion: overrides.reducedMotion ?? caps.reducedMotion,
  };
}

export function shouldAnimateSignal(event: MotionEvent, policy: MotionPolicy): boolean {
  return allowedChannels(event, policy).includes("signal");
}

export function shouldUseColor(policy: MotionPolicy, colorEnabled: boolean): boolean {
  return colorEnabled && !policy.noColor && !policy.screenReader;
}

export function shouldUseAscii(policy: MotionPolicy, hasNerdFonts: boolean): boolean {
  if (policy.lowColor || policy.screenReader) return true;
  return !hasNerdFonts;
}

export function stableStateMarker(event: MotionEvent, ascii = false): string {
  switch (event) {
    case "idle":
      return ascii ? "[..]" : "[·]";
    case "success":
    case "tool.end":
      return ascii ? "[ok]" : "[✓]";
    case "warning":
    case "policy.deny":
      return ascii ? "[!]" : "[!]";
    case "error":
      return ascii ? "[ERR]" : "[✗]";
    default:
      return ascii ? "[~]" : "[◆]";
  }
}

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
  }
}

export function cycleMotionLevel(level: MotionLevel): MotionLevel {
  const index = LEVELS.indexOf(level);
  return LEVELS[(index + 1) % LEVELS.length]!;
}

export function effectiveFps(policy: MotionPolicy, consumers: number): number {
  if (policy.screenReader || policy.level === "off" || consumers === 0) return 0;
  if (effectiveLevel(policy) === "reduced") return 3;
  return 10;
}
