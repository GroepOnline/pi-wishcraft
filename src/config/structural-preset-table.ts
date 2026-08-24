/**
 * structural-preset-table.ts
 * ---------------------------------------------------------------------------
 * The ten signature structural preset definitions. Data only; helpers and the
 * public API live in structural-preset-data.ts and structural-presets.ts.
 * ---------------------------------------------------------------------------
 */

import type { StructuralPresetDef, StructuralPresetName } from "./types.ts";
import {
  BORDERLESS_CHROME,
  DEFAULT_DECK,
  MINIMAL_CHROME,
  ROUNDED_CHROME,
  motion,
  tokens,
} from "./structural-preset-data.ts";

export const STRUCTURAL_PRESETS: Record<StructuralPresetName, StructuralPresetDef> = {
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
};
