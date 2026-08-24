/**
 * structural-presets.ts
 * ---------------------------------------------------------------------------
 * Ten signature structural presets for Wishcraft vNext. Each preset is a full
 * design system: tokens, chrome, signal grammar, motion refs, deck chrome,
 * welcome screen, and glyph pairs (Nerd + ASCII).
 * ---------------------------------------------------------------------------
 */

import type {
  StructuralPresetDef,
  StructuralPresetName,
} from "./types.ts";
import { STRUCTURAL_PRESET_NAMES } from "./types.ts";

export { STRUCTURAL_PRESET_NAMES };
import type { MotionEvent } from "../motion/types.ts";
import type { MotionRef } from "./types.ts";
import { defaultMotionFor } from "../motion/catalog.ts";
import { STRUCTURAL_PRESETS } from "./structural-preset-table.ts";

export { STRUCTURAL_PRESETS };

const _UNUSED_PRESETS: Record<StructuralPresetName, StructuralPresetDef> = {
  lanternwake: {
    name: "lanternwake",
    displayName: "Lanternwake",
    description: "Warm amber embers in a dark room — Wishcraft's signature lantern identity.",
    tokens: tokens({
      surface: "#0f172a",
      surfaceRaised: "#1e293b",
      text: "#f8fafc",
      textMuted: "#94a3b8",
      primary: "#f59e0b",
      secondary: "#d97706",
      accent: "#ea580c",
      success: "#22c55e",
      warning: "#fbbf24",
      error: "#ef4444",
      focus: "#fbbf24",
      selection: "#334155",
      motionDim: "#78350f",
      motionHot: "#fbbf24",
      motionTrail: "#92400e",
    }),
    chrome: ROUNDED_CHROME,
    signal: {
      layout: "fluid",
      separators: { left: "━╾", right: "╼━", subLeft: "✦", subRight: "✦" },
      caps: { leftOpen: "◇", leftClose: "◇", rightOpen: "✦", rightClose: "✦" },
      animation: "ember-relay",
    },
    motion: motion("ember-relay"),
    deck: DEFAULT_DECK,
    welcome: { lantern: true, ambient: true, motionId: "ember-relay" },
    glyphs: {
      mode: "auto",
      model: "◇",
      modelAscii: "*",
      segment: "✦",
      segmentAscii: "*",
    },
  },

  threadbound: {
    name: "threadbound",
    displayName: "Threadbound",
    description: "Woven craft aesthetic with indigo thread and travelling stitch knots.",
    tokens: tokens({
      surface: "#18181b",
      surfaceRaised: "#27272a",
      text: "#fafafa",
      textMuted: "#a1a1aa",
      primary: "#6366f1",
      secondary: "#818cf8",
      accent: "#ec4899",
      success: "#34d399",
      warning: "#fbbf24",
      error: "#f87171",
      focus: "#a5b4fc",
      selection: "#3f3f46",
      motionDim: "#312e81",
      motionHot: "#ec4899",
      motionTrail: "#4c1d95",
    }),
    chrome: {
      frame: "minimal",
      corners: { tl: "┌", tr: "┐", bl: "└", br: "┘" },
      dividers: { horizontal: "─", vertical: "│", cross: "┼" },
      density: "compact",
    },
    signal: {
      layout: "woven",
      separators: { left: "──╼", right: "╾──", subLeft: "·", subRight: "·" },
      caps: { leftOpen: "╼", leftClose: "╾", rightOpen: "◆", rightClose: "◆" },
      animation: "stitch-travel",
    },
    motion: motion("stitch-travel"),
    deck: { ...DEFAULT_DECK, panelStyle: "inset" },
    welcome: { lantern: false, ambient: true, motionId: "stitch-travel" },
    glyphs: {
      mode: "auto",
      model: "╼",
      modelAscii: "-",
      segment: "·",
      segmentAscii: ".",
    },
  },

  scryglass: {
    name: "scryglass",
    displayName: "Scryglass",
    description: "Refractive glass capsules with prism cyan and lens violet.",
    tokens: tokens({
      surface: "#090d16",
      surfaceRaised: "#111827",
      text: "#e0f2fe",
      textMuted: "#67e8f9",
      primary: "#06b6d4",
      secondary: "#22d3ee",
      accent: "#8b5cf6",
      success: "#2dd4bf",
      warning: "#fbbf24",
      error: "#fb7185",
      focus: "#67e8f9",
      selection: "#1e3a5f",
      motionDim: "#164e63",
      motionHot: "#22d3ee",
      motionTrail: "#312e81",
    }),
    chrome: {
      frame: "rounded",
      corners: { tl: "╭", tr: "╮", bl: "╰", br: "╯" },
      dividers: { horizontal: "─", vertical: "│", cross: "┼" },
      density: "medium",
    },
    signal: {
      layout: "capsule",
      separators: { left: "────", right: "────" },
      caps: { leftOpen: "╭", leftClose: "╮", rightOpen: "╰", rightClose: "╯" },
      animation: "refraction-sweep",
    },
    motion: motion("refraction-sweep"),
    deck: DEFAULT_DECK,
    welcome: { lantern: false, ambient: true, motionId: "refraction-sweep" },
    glyphs: {
      mode: "auto",
      model: "◈",
      modelAscii: "O",
      segment: "◇",
      segmentAscii: "o",
    },
  },

  runebloom: {
    name: "runebloom",
    displayName: "Runebloom",
    description: "Organic alchemical sigils with sparse anchors and event bloom.",
    tokens: tokens({
      surface: "#0c140f",
      surfaceRaised: "#14261a",
      text: "#ecfdf5",
      textMuted: "#6ee7b7",
      primary: "#10b981",
      secondary: "#34d399",
      accent: "#eab308",
      success: "#22c55e",
      warning: "#f59e0b",
      error: "#ef4444",
      focus: "#fde047",
      selection: "#14532d",
      motionDim: "#064e3b",
      motionHot: "#eab308",
      motionTrail: "#166534",
    }),
    chrome: MINIMAL_CHROME,
    signal: {
      layout: "sparse",
      separators: { left: " · ", right: " · " },
      caps: { leftOpen: "◇", leftClose: "◇" },
      animation: "rune-bloom",
    },
    motion: motion("rune-bloom", { thinking: "rune-bloom", streaming: "rune-bloom" }),
    deck: { ...DEFAULT_DECK, activityStyle: "none" },
    welcome: { lantern: true, ambient: false, motionId: "rune-bloom" },
    glyphs: {
      mode: "auto",
      model: "◇",
      modelAscii: "+",
      segment: "·",
      segmentAscii: ".",
    },
  },

  moonwell: {
    name: "moonwell",
    displayName: "Moonwell",
    description: "Nocturnal sanctuary with silver arcs and orbital breathe.",
    tokens: tokens({
      surface: "#020617",
      surfaceRaised: "#0f172a",
      text: "#e2e8f0",
      textMuted: "#94a3b8",
      primary: "#94a3b8",
      secondary: "#cbd5e1",
      accent: "#38bdf8",
      success: "#4ade80",
      warning: "#fbbf24",
      error: "#f87171",
      focus: "#7dd3fc",
      selection: "#1e293b",
      motionDim: "#1e3a5f",
      motionHot: "#38bdf8",
      motionTrail: "#334155",
    }),
    chrome: ROUNDED_CHROME,
    signal: {
      layout: "arc",
      separators: { left: "───", right: "───", subLeft: "◜", subRight: "◟" },
      caps: { leftOpen: "◜", leftClose: "◝", rightOpen: "◞", rightClose: "◟" },
      animation: "lunar-breathe",
    },
    motion: motion("lunar-breathe"),
    deck: DEFAULT_DECK,
    welcome: { lantern: true, ambient: true, motionId: "lunar-breathe" },
    glyphs: {
      mode: "auto",
      model: "◌",
      modelAscii: "O",
      segment: "◦",
      segmentAscii: "o",
    },
  },

  hexforge: {
    name: "hexforge",
    displayName: "Hexforge",
    description: "Industrial forge with block hexagons and heat propagation.",
    tokens: tokens({
      surface: "#1c1917",
      surfaceRaised: "#292524",
      text: "#fafaf9",
      textMuted: "#a8a29e",
      primary: "#f97316",
      secondary: "#fb923c",
      accent: "#ef4444",
      success: "#84cc16",
      warning: "#fbbf24",
      error: "#dc2626",
      focus: "#fdba74",
      selection: "#44403c",
      motionDim: "#7c2d12",
      motionHot: "#ef4444",
      motionTrail: "#9a3412",
    }),
    chrome: {
      frame: "square",
      corners: { tl: "┏", tr: "┓", bl: "┗", br: "┛" },
      dividers: { horizontal: "━", vertical: "┃", cross: "╋" },
      density: "compact",
    },
    signal: {
      layout: "block",
      separators: { left: "▰▰", right: "▰▰" },
      caps: { leftOpen: "⬡", leftClose: "⬡", rightOpen: "◆", rightClose: "◆" },
      animation: "hex-relay",
    },
    motion: motion("hex-relay"),
    deck: { navigation: "rail", panelStyle: "framed", activityStyle: "bar" },
    welcome: { lantern: false, ambient: false, motionId: "hex-relay" },
    glyphs: {
      mode: "auto",
      model: "⬡",
      modelAscii: "#",
      segment: "█",
      segmentAscii: "#",
    },
  },

  vellum: {
    name: "vellum",
    displayName: "Vellum",
    description: "Editorial grimoire with parchment ink and writing reveal.",
    tokens: tokens({
      surface: "#1a1815",
      surfaceRaised: "#292524",
      text: "#faf5eb",
      textMuted: "#d6d3d1",
      primary: "#d97706",
      secondary: "#b45309",
      accent: "#a16207",
      success: "#65a30d",
      warning: "#ca8a04",
      error: "#b91c1c",
      focus: "#fbbf24",
      selection: "#44403c",
      motionDim: "#57534e",
      motionHot: "#d97706",
      motionTrail: "#78716c",
    }),
    chrome: BORDERLESS_CHROME,
    signal: {
      layout: "editorial",
      separators: { left: "╾", right: "╼" },
      caps: {},
      animation: "writing-reveal",
    },
    motion: motion("writing-reveal"),
    deck: { navigation: "minimal", panelStyle: "borderless", activityStyle: "none" },
    welcome: { lantern: true, ambient: false, motionId: "writing-reveal" },
    glyphs: {
      mode: "auto",
      model: "",
      modelAscii: "",
      segment: "·",
      segmentAscii: ".",
    },
  },

  wisp: {
    name: "wisp",
    displayName: "Wisp",
    description: "Ethereal minimal whitespace with phase drift ambient motion.",
    tokens: tokens({
      surface: "#0b0f19",
      surfaceRaised: "#111827",
      text: "#e2e8f0",
      textMuted: "#94a3b8",
      primary: "#cbd5e1",
      secondary: "#94a3b8",
      accent: "#38bdf8",
      success: "#4ade80",
      warning: "#fbbf24",
      error: "#f87171",
      focus: "#7dd3fc",
      selection: "#1e293b",
      motionDim: "#1e293b",
      motionHot: "#38bdf8",
      motionTrail: "#334155",
    }),
    chrome: MINIMAL_CHROME,
    signal: {
      layout: "sparse",
      separators: { left: "   ", right: " · " },
      caps: { leftOpen: "◌", leftClose: "◌" },
      animation: "wisp",
    },
    motion: motion("wisp", {
      thinking: "wisp",
      streaming: "wisp",
      "tool.start": "wisp",
    }),
    deck: { navigation: "minimal", panelStyle: "borderless", activityStyle: "none" },
    welcome: { lantern: false, ambient: true, motionId: "wisp" },
    glyphs: {
      mode: "auto",
      model: "◌",
      modelAscii: "o",
      segment: "·",
      segmentAscii: ".",
    },
  },

  starweave: {
    name: "starweave",
    displayName: "Starweave",
    description: "Celestial cartography with constellation nodes and path traversal.",
    tokens: tokens({
      surface: "#050515",
      surfaceRaised: "#0f0a1e",
      text: "#ede9fe",
      textMuted: "#c4b5fd",
      primary: "#a855f7",
      secondary: "#c084fc",
      accent: "#38bdf8",
      success: "#34d399",
      warning: "#fbbf24",
      error: "#fb7185",
      focus: "#e879f9",
      selection: "#2e1065",
      motionDim: "#4c1d95",
      motionHot: "#38bdf8",
      motionTrail: "#6b21a8",
    }),
    chrome: ROUNDED_CHROME,
    signal: {
      layout: "constellation",
      separators: { left: "───", right: "───", subLeft: "✦", subRight: "✦" },
      caps: { leftOpen: "✦", leftClose: "✦", rightOpen: "◆", rightClose: "◆" },
      animation: "path-traverse",
    },
    motion: motion("path-traverse"),
    deck: DEFAULT_DECK,
    welcome: { lantern: false, ambient: true, motionId: "path-traverse" },
    glyphs: {
      mode: "auto",
      model: "✦",
      modelAscii: "*",
      segment: "◆",
      segmentAscii: "*",
    },
  },

  crucible: {
    name: "crucible",
    displayName: "Crucible",
    description: "Alchemical fluid cells with liquid level rise on activity.",
    tokens: tokens({
      surface: "#110b11",
      surfaceRaised: "#1f1520",
      text: "#fce7f3",
      textMuted: "#f9a8d4",
      primary: "#ec4899",
      secondary: "#f472b6",
      accent: "#f43f5e",
      success: "#4ade80",
      warning: "#fbbf24",
      error: "#e11d48",
      focus: "#fb7185",
      selection: "#4a044e",
      motionDim: "#831843",
      motionHot: "#f43f5e",
      motionTrail: "#9d174d",
    }),
    chrome: {
      frame: "double",
      corners: { tl: "╔", tr: "╗", bl: "╚", br: "╝" },
      dividers: { horizontal: "═", vertical: "║", cross: "╬" },
      density: "medium",
    },
    signal: {
      layout: "cell",
      separators: { left: "]", right: "[" },
      caps: { leftOpen: "[", leftClose: "]", rightOpen: "[", rightClose: "]" },
      animation: "liquid-rise",
    },
export function isStructuralPresetName(name: string): name is StructuralPresetName {
  return (STRUCTURAL_PRESET_NAMES as readonly string[]).includes(name);
}

export function getStructuralPreset(name: StructuralPresetName): StructuralPresetDef {
  return STRUCTURAL_PRESETS[name];
}

/** Signature motion id for a structural preset (streaming / thinking lane). */
export function signatureMotionFor(name: StructuralPresetName): MotionRef {
  return STRUCTURAL_PRESETS[name].signal.animation;
}

/** Fill missing motion events with catalog defaults. */
export function completeMotionMap(
  partial: Partial<Record<MotionEvent, MotionRef>>,
): Partial<Record<MotionEvent, MotionRef>> {
  const complete: Partial<Record<MotionEvent, MotionRef>> = { ...partial };
  const events: MotionEvent[] = [
    "idle",
    "thinking",
    "streaming",
    "tool.start",
    "tool.end",
    "idea.capture",
    "skill.insert",
    "policy.deny",
    "repair",
    "compact",
    "success",
    "warning",
    "error",
  ];
  for (const event of events) {
    if (complete[event] === undefined) {
      complete[event] = defaultMotionFor(event);
    }
  }
  return complete;
}
