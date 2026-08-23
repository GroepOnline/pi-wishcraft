/**
 * catalog.ts
 * ---------------------------------------------------------------------------
 * Motion definitions plus the event-to-channel matrix and per-channel
 * cadences. Everything here is plain data so the gallery, the composer and the
 * tests can read it without a TUI.
 * ---------------------------------------------------------------------------
 */

import type { MotionChannel, MotionDef, MotionEvent } from "./types.ts";

export const MOTION_CATALOG: readonly MotionDef[] = [
  {
    id: "ember-relay",
    name: "Ember Relay",
    category: "wishcraft",
    kind: "generator",
    channels: ["workingGlyph", "signal"],
    colorRole: "motionHot",
    fallbackGlyph: "*",
    loop: "while-active",
    generator: { geometry: "ember", trail: 3, direction: "forward", intervalMs: 90, ease: "pulse" },
    description: "Lanternwake signature. A warm ember travels the connected segments, only while work happens.",
  },
  {
    id: "wisp",
    name: "Wisp",
    category: "wishcraft",
    kind: "frames",
    channels: ["workingGlyph", "ambient"],
    colorRole: "motionDim",
    fallbackGlyph: "o",
    loop: "ambient",
    frames: ["◌", "○", "◈", "○"],
    description: "Soft phase drift for minimal presets.",
  },
  {
    id: "rune-bloom",
    name: "Rune Bloom",
    category: "wishcraft",
    kind: "generator",
    channels: ["signal", "deckTransient", "borderEmphasis"],
    colorRole: "accent",
    fallbackGlyph: "+",
    loop: "finite",
    generator: { geometry: "bloom", radius: 2, intervalMs: 70, ease: "pulse" },
    description: "Geometry opens briefly on success, capture or insert. No permanent movement.",
  },
  {
    id: "hex-relay",
    name: "Hex Relay",
    category: "wishcraft",
    kind: "generator",
    channels: ["signal", "panelIndicator", "workingGlyph"],
    colorRole: "motionHot",
    fallbackGlyph: "#",
    loop: "while-active",
    generator: { geometry: "heat", trail: 4, direction: "forward", intervalMs: 80, ease: "linear" },
    description: "Heat propagates block by block toward the active tool.",
  },
  {
    id: "stitch-travel",
    name: "Stitch Travel",
    category: "wishcraft",
    kind: "generator",
    channels: ["signal"],
    colorRole: "primary",
    fallbackGlyph: "-",
    loop: "while-active",
    generator: { geometry: "stitch", trail: 2, direction: "forward", intervalMs: 100, ease: "linear" },
    description: "A travelling knot runs from producer to consumer.",
  },
  {
    id: "refraction-sweep",
    name: "Refraction Sweep",
    category: "wishcraft",
    kind: "generator",
    channels: ["signal"],
    colorRole: "motionHot",
    fallbackGlyph: ">",
    loop: "while-active",
    generator: { geometry: "refract", trail: 2, intervalMs: 110, ease: "linear" },
    description: "A highlight refracts through the next capsule.",
  },
  {
    id: "writing-reveal",
    name: "Writing Reveal",
    category: "wishcraft",
    kind: "generator",
    channels: ["signal"],
    colorRole: "text",
    fallbackGlyph: "-",
    loop: "while-active",
    generator: { geometry: "write", intervalMs: 90, ease: "linear" },
    description: "The rule grows the way ink grows on vellum.",
  },
  {
    id: "path-traverse",
    name: "Path Traversal",
    category: "wishcraft",
    kind: "generator",
    channels: ["signal", "deckTransient"],
    colorRole: "motionHot",
    fallbackGlyph: "*",
    loop: "while-active",
    generator: { geometry: "path", intervalMs: 120, ease: "linear" },
    description: "Events travel along real constellation edges.",
  },
  {
    id: "liquid-rise",
    name: "Liquid Rise",
    category: "wishcraft",
    kind: "generator",
    channels: ["signal", "panelIndicator"],
    colorRole: "motionHot",
    fallbackGlyph: "=",
    loop: "while-active",
    generator: { geometry: "liquid", intervalMs: 140, ease: "breathe" },
    description: "Activity changes the liquid level instead of spinning.",
  },
  {
    id: "lunar-breathe",
    name: "Lunar Breathe",
    category: "matrix",
    kind: "generator",
    channels: ["workingGlyph", "signal", "ambient"],
    colorRole: "secondary",
    fallbackGlyph: "O",
    loop: "ambient",
    generator: { geometry: "orbit", radius: 2, trail: 3, intervalMs: 280, ease: "breathe" },
    description: "Orbit and phase motion, slow enough for night work.",
  },
  {
    id: "lemniscate",
    name: "Lemniscate Pulse",
    category: "matrix",
    kind: "frames",
    channels: ["workingGlyph"],
    colorRole: "accent",
    fallbackGlyph: "8",
    loop: "while-active",
    frames: ["∞", "8"],
    description: "Infinity trace for thinking, without a cheap spinner.",
  },
  {
    id: "petal-shimmer",
    name: "Petal Shimmer",
    category: "matrix",
    kind: "frames",
    channels: ["workingGlyph", "deckTransient"],
    colorRole: "accent",
    fallbackGlyph: "*",
    loop: "finite",
    frames: ["✧", "✦", "✶", "✦"],
    description: "Local bloom near the action, never a screen-wide blocker.",
  },
  {
    id: "wing-metronome",
    name: "Wing Metronome",
    category: "matrix",
    kind: "frames",
    channels: ["workingGlyph"],
    colorRole: "secondary",
    fallbackGlyph: "^",
    loop: "while-active",
    frames: ["△", "▲", "▽", "▼"],
    description: "Symmetric beat for long tool runs.",
  },
  {
    id: "helix",
    name: "Helix",
    category: "procedural",
    kind: "frames",
    channels: ["workingGlyph", "signal"],
    colorRole: "motionTrail",
    fallbackGlyph: "%",
    loop: "while-active",
    frames: ["⡀", "⡄", "⡆", "⡇", "⣇", "⣧", "⣷", "⣿"],
    description: "Braille helix. Dense but still readable.",
  },
  {
    id: "braille-wave",
    name: "Braille Wave",
    category: "procedural",
    kind: "frames",
    channels: ["signal"],
    colorRole: "primary",
    fallbackGlyph: "~",
    loop: "while-active",
    frames: ["⠁", "⠃", "⠇", "⠧", "⠷", "⠿"],
    description: "Rising braille wave for lane fills.",
  },
  {
    id: "ripple",
    name: "Ripple",
    category: "procedural",
    kind: "generator",
    channels: ["signal", "panelIndicator"],
    colorRole: "motionTrail",
    fallbackGlyph: "~",
    loop: "finite",
    generator: { geometry: "wave", trail: 5, intervalMs: 70, ease: "pulse" },
    description: "Short wave used for compact and success.",
  },
  {
    id: "braille-spinner",
    name: "Braille Spinner",
    category: "classic",
    kind: "frames",
    channels: ["workingGlyph"],
    colorRole: "textMuted",
    fallbackGlyph: "|",
    loop: "while-active",
    frames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
    description: "Classic braille spinner. Functional fallback.",
  },
  {
    id: "quarter",
    name: "Quarter",
    category: "classic",
    kind: "frames",
    channels: ["workingGlyph"],
    colorRole: "textMuted",
    fallbackGlyph: "O",
    loop: "while-active",
    frames: ["◐", "◓", "◑", "◒"],
    description: "Quarter-circle phase.",
  },
  {
    id: "bar",
    name: "Bar",
    category: "classic",
    kind: "frames",
    channels: ["workingGlyph", "panelIndicator"],
    colorRole: "primary",
    fallbackGlyph: "=",
    loop: "while-active",
    frames: ["▏", "▎", "▍", "▌", "▋", "▊", "▉", "█"],
    description: "Growing bar for context and compaction.",
  },
  {
    id: "bounce",
    name: "Bounce",
    category: "classic",
    kind: "frames",
    channels: ["workingGlyph"],
    colorRole: "accent",
    fallbackGlyph: "o",
    loop: "while-active",
    frames: ["●", "•", "·", "•"],
    description: "Small local bounce.",
  },
];

/**
 * Which channels an event may light up. Deliberately sparse: idle must not
 * touch the working glyph, and a policy denial must never start a spinner.
 */
export const CHANNEL_MATRIX: Record<MotionEvent, readonly MotionChannel[]> = {
  idle: ["ambient"],
  thinking: ["workingGlyph", "signal"],
  streaming: ["workingGlyph", "signal", "panelIndicator"],
  "tool.start": ["workingGlyph", "signal", "panelIndicator"],
  "tool.end": ["signal", "panelIndicator"],
  "idea.capture": ["deckTransient"],
  "skill.insert": ["signal", "deckTransient"],
  "policy.deny": ["deckTransient", "borderEmphasis"],
  repair: ["workingGlyph", "deckTransient", "panelIndicator"],
  compact: ["workingGlyph", "signal", "deckTransient", "panelIndicator"],
  success: ["signal", "deckTransient", "borderEmphasis"],
  warning: ["deckTransient", "borderEmphasis"],
  error: ["deckTransient", "borderEmphasis"],
};

/** Documented cadence bands per channel. */
export const CADENCE_MS: Record<MotionChannel, { min: number; max: number }> = {
  workingGlyph: { min: 80, max: 120 },
  signal: { min: 80, max: 120 },
  deckTransient: { min: 50, max: 100 },
  panelIndicator: { min: 120, max: 250 },
  borderEmphasis: { min: 200, max: 400 },
  ambient: { min: 250, max: 750 },
};

/** Gallery previews are allowed to run hotter than production channels. */
export const PREVIEW_INTERVAL_MS = 50;

export function getMotion(id: string): MotionDef | undefined {
  return MOTION_CATALOG.find((motion) => motion.id === id);
}

export function channelsForEvent(event: MotionEvent): readonly MotionChannel[] {
  return CHANNEL_MATRIX[event];
}

export function eventUsesChannel(event: MotionEvent, channel: MotionChannel): boolean {
  return CHANNEL_MATRIX[event].includes(channel);
}

/** Events that keep animating rather than firing once. */
export function isContinuous(event: MotionEvent): boolean {
  return (
    event === "idle" ||
    event === "thinking" ||
    event === "streaming" ||
    event === "tool.start"
  );
}

export function defaultMotionFor(event: MotionEvent): string {
  switch (event) {
    case "idle":
      return "wisp";
    case "thinking":
    case "streaming":
      return "ember-relay";
    case "tool.start":
      return "hex-relay";
    case "tool.end":
    case "success":
    case "idea.capture":
    case "skill.insert":
      return "rune-bloom";
    case "compact":
      return "bar";
    case "repair":
      return "stitch-travel";
    case "policy.deny":
    case "warning":
    case "error":
      return "rune-bloom";
  }
}
