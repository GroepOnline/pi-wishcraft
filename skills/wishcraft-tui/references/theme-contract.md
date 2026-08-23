# Semantic Design Tokens & Theme Contract

## Overview

Wishcraft follows a token-driven design system inspired by Charm Crush. Rather than hardcoding ad-hoc color values or tying colors strictly to concrete segment names, themes are expressed through an abstract layer of **Semantic Design Tokens** (`WishcraftTokens`).

```
┌────────────────────────────────────────────────────────┐
│                   Wishcraft Presets                    │
│      (Lanternwake · Threadbound · Scryglass · ...)     │
└───────────────────────────┬────────────────────────────┘
                            │ populates
                            ▼
┌────────────────────────────────────────────────────────┐
│                   WishcraftTokens                      │
│     (surface, text, primary, accent, motionHot, ...)   │
└───────────────────────────┬────────────────────────────┘
                            │ maps & derives
                            ▼
┌────────────────────────────────────────────────────────┐
│                 Legacy SemanticColor                   │
│        (model, gitClean, context, cost, border)        │
└────────────────────────────────────────────────────────┘
```

---

## Token Specifications

```typescript
export interface WishcraftTokens {
  // Surfaces & Backgrounds
  surface: ColorValue;          // Base frame and background tint
  surfaceRaised: ColorValue;    // Modals, popovers, and elevated cards

  // Typography
  text: ColorValue;             // Primary text and active values
  textMuted: ColorValue;        // Secondary labels, timestamps, and dim chrome

  // Brand & Accents
  primary: ColorValue;          // Primary identity, active model badge
  secondary: ColorValue;        // Path indicators, structural dividers
  accent: ColorValue;           // Highlights, tags, key metric accents

  // Feedback & State
  success: ColorValue;          // Clean git status, healthy skills, completed tasks
  warning: ColorValue;          // Uncommitted git diffs, warning limits, compact alerts
  error: ColorValue;            // Tool execution failures, policy blocks, error states

  // Interaction
  focus: ColorValue;            // Focused input field, active navigation item
  selection: ColorValue;        // Highlighted table row or search match

  // Motion & Animation Channels
  motionDim: ColorValue;        // Low-intensity background sweep or trailing tail
  motionHot: ColorValue;        // High-intensity active pulse or spark
  motionTrail: ColorValue;      // Intermediate gradient or propagation step
}

export type ColorValue = ThemeColor | `#${string}`;
```

---

## Backward-Compatible Semantic Mapping

To ensure 100% backward compatibility with pre-existing color configurations and third-party presets, legacy `SemanticColor` values are derived from `WishcraftTokens` according to this default mapping:

| Legacy `SemanticColor` Key | Source `WishcraftToken` | Description |
| :--- | :--- | :--- |
| `model` | `tokens.primary` | Active LLM badge indicator |
| `path` | `tokens.secondary` | Working directory and file paths |
| `gitClean` | `tokens.success` | Clean git repository status |
| `gitDirty` | `tokens.warning` | Dirty/uncommitted git changes |
| `context` | `tokens.text` | Normal context token usage (< 70%) |
| `contextWarn` | `tokens.warning` | Context warning threshold (70% - 90%) |
| `contextError` | `tokens.error` | Critical context limit (> 90%) |
| `cost` | `tokens.accent` | Session usage / cost metrics |
| `queue` | `tokens.textMuted` | Queued command count badge |
| `separator` | `tokens.textMuted` | Powerline segment divider symbols |
| `border` | `tokens.surfaceRaised` | Deck outer frame and partition lines |

---

## Extended Preset Contract (`PresetDef`)

The `PresetDef` schema extends legacy configurations with modular personality definitions:

```typescript
export interface PresetDef {
  // Legacy Layout Properties (Retained for 100% compatibility)
  leftSegments: SegmentType[];
  rightSegments: SegmentType[];
  secondarySegments?: SegmentType[];
  separator: SeparatorStyle;
  segmentOptions?: Record<string, SegmentOptions>;
  colors?: Partial<Record<SemanticColor, ColorValue>>;

  // vNext Structural Personality Definitions
  tokens?: WishcraftTokens;
  chrome?: ChromeSpec;
  signal?: SignalSpec;
  motion?: Partial<Record<MotionEvent, MotionRef>>;
  deck?: DeckSpec;
  welcome?: WelcomeSpec;
  glyphs?: GlyphSet;
}

export interface ChromeSpec {
  frame: "rounded" | "square" | "double" | "minimal" | "borderless";
  corners: { tl: string; tr: string; bl: string; br: string };
  dividers: { horizontal: string; vertical: string; cross: string };
  density: "compact" | "medium" | "spacious";
}

export interface SignalSpec {
  layout: "standard" | "capsule" | "woven" | "sparse" | "block";
  separators: {
    left: string;
    right: string;
    subLeft?: string;
    subRight?: string;
  };
  caps: {
    leftOpen?: string;
    leftClose?: string;
    rightOpen?: string;
    rightClose?: string;
  };
  animation: string; // MotionRef ID
}
```
