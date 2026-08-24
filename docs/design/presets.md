# Structural Presets Specification

## Overview

Wishcraft introduces **ten signature structural presets**. A preset is not merely a color skin; it defines a complete design system combining:
1. **Token Palette**: Cohesive semantic colors.
2. **Chrome Geometry**: Frame borders, corners, divider styles, and density.
3. **Signal Grammar**: Lane structure, module capsules, separators, and caps.
4. **Glyph Grammar**: Curated Unicode and Nerd Font iconography with clean ASCII fallbacks.
5. **Signature Motion**: Procedural animations reflecting the preset's identity.

---

## The Ten Structural Presets

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ PRESET           CHARACTER                   SIGNAL STRUCTURE       SIGNATURE MOTION   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. Lanternwake   Warm Amber / Signature Dark Fluid Segments         Ember Breathe      │
│ 2. Threadbound   Woven Craft / Indigo        Thin Knot Wire         Stitch Travel      │
│ 3. Scryglass     Refractive Glass / Cyan     Capsule Lenses         Refraction Sweep   │
│ 4. Runebloom     Organic Alchemical Sigils   Sparse Anchors         Sigil Bloom        │
│ 5. Moonwell      Nocturnal Orbit / Silver    Arc Segments           Lunar Breathe      │
│ 6. Hexforge      Heavy Industrial Steel      Block Hexagons         Heat Propagation   │
│ 7. Vellum        Editorial Grimoire          Borderless Line        Writing Reveal     │
│ 8. Wisp          Ethereal Minimalist         Max Whitespace         Phase Drift        │
│ 9. Starweave     Celestial Cartography       Constellation Nodes    Path Traversal     │
│ 10. Crucible     Alchemical Fluid / Magma    Cell Meter Rise        Liquid Surge       │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 1. Lanternwake (Default Signature Identity)
- **Concept**: Warm amber and glowing embers in a dark room. Grounded in Wishcraft's original lantern metaphor.
- **Tokens**:
  - `primary`: `#f59e0b` (Warm Amber)
  - `accent`: `#ea580c` (Ember Orange)
  - `surface`: `#0f172a` (Deep Slate)
  - `motionHot`: `#fbbf24` (Golden Flare)
  - `motionTrail`: `#78350f` (Ember Ash)
- **Signal Grammar**:
  ```
  ◇ GPT-5.6 ━━━╾✦╼━━━━ main ━━━━━ read ━━━━━ ctx 47%
  ```
- **Motion**: `ember.breathe` — utilizes the mathematical formula from `renderLantern` ($\sin(t \times 1.1) + \sin(t \times 7.3)$) to pulse only during active events.

---

### 2. Threadbound
- **Concept**: Artisan tailoring and woven loom mechanics.
- **Tokens**:
  - `primary`: `#6366f1` (Indigo Thread)
  - `accent`: `#ec4899` (Magenta Stitch)
  - `surface`: `#18181b` (Zinc Weave)
- **Signal Grammar**:
  ```
  model ──╼·╾──── branch ──╼·╾──── tool ──╼◆╾── context
  ```
- **Motion**: `stitch.travel` — step pulse traveling smoothly across thread nodes.

---

### 3. Scryglass
- **Concept**: Precision optics, lenses, and refractive glass capsules.
- **Tokens**:
  - `primary`: `#06b6d4` (Prism Cyan)
  - `accent`: `#8b5cf6` (Lens Violet)
  - `surface`: `#090d16` (Deep Glass)
- **Signal Grammar**:
  ```
  ╭ GPT-5.6 ╮────╭ main ╮────╭ read ╮────╭ 47% ╮
  ╰─────────╯    ╰──────╯    ╰──────╯    ╰─────╯
  ```
- **Motion**: `refraction.sweep` — light wave passing through each capsule sequentially.

---

### 4. Runebloom
- **Concept**: Ancient stone sigils bursting into life upon magic release.
- **Tokens**:
  - `primary`: `#10b981` (Emerald Moss)
  - `accent`: `#eab308` (Rune Gold)
  - `surface`: `#0c140f` (Forest Granite)
- **Signal Grammar**:
  ```
  ◇  GPT-5.6  ·  main  ·  read  ·  47%
  ```
- **Motion**: `bloom.on-event` — geometry expands outwardly on state changes, then stabilizes into quiet repose.

---

### 5. Moonwell
- **Concept**: Nocturnal sanctuary, silver light, and celestial orbits.
- **Tokens**:
  - `primary`: `#94a3b8` (Moon Silver)
  - `accent`: `#38bdf8` (Starlight Sky)
  - `surface`: `#020617` (Midnight Black)
- **Signal Grammar**:
  ```
  ◜ GPT-5.6 ─── ◝ main ─── ◞ read ─── ◟ 47%
  ```
- **Motion**: `lunar.breathe` — smooth sinusoidal phase transitions echoing orbital mechanics.

---

### 6. Hexforge
- **Concept**: Heavy forge machinery, steel plating, and thermal conduits.
- **Tokens**:
  - `primary`: `#f97316` (Forge Orange)
  - `accent`: `#ef4444` (Molten Red)
  - `surface`: `#1c1917` (Anvil Dark)
- **Signal Grammar**:
  ```
  ⬡ GPT-5.6 ▰▰ MAIN ▰▰ ◆ READ ▰▰ 47% ⬡
  ```
- **Motion**: `heat.propagate` — thermal wave advancing across block matrices (`█▓▒░`).

---

### 7. Vellum
- **Concept**: Modern editorial, typography, and calligraphic ink strokes.
- **Tokens**:
  - `primary`: `#d97706` (Old Gold Ink)
  - `accent`: `#a16207` (Deep Sepia)
  - `surface`: `#1a1815` (Dark Parchment)
- **Signal Grammar**:
  ```
  Wishcraft / GPT-5.6
  ──────────────────────────────────────╾ main · read · ctx 47%
  ```
- **Motion**: `writing.reveal` — rule line draws from left to right during streaming output.

---

### 8. Wisp
- **Concept**: Minimalist ethereal calm, generous negative space, pure essential information.
- **Tokens**:
  - `primary`: `#cbd5e1` (Morning Mist)
  - `accent`: `#38bdf8` (Ethereal Blue)
  - `surface`: `#0b0f19` (Void Blue)
- **Signal Grammar**:
  ```
  ◌ GPT-5.6   main · read · 47%
  ```
- **Motion**: `phase.drift` — subtle, low-frequency opacity breathing.

---

### 9. Starweave
- **Concept**: Astrological star maps, navigational geometry, and connected constellations.
- **Tokens**:
  - `primary`: `#a855f7` (Cosmic Purple)
  - `accent`: `#38bdf8` (Nebula Cyan)
  - `surface`: `#050515` (Deep Space)
- **Signal Grammar**:
  ```
  ✦ GPT-5.6 ───· main ·───◆ read ───✦ 47%
  ```
- **Motion**: `path.traverse` — stellar particle moving across intersecting coordinate edges.

---

### 10. Crucible
- **Concept**: Dynamic alchemical fluid levels, bubbling reactions, and exothermic changes.
- **Tokens**:
  - `primary`: `#ec4899` (Alchemical Rose)
  - `accent`: `#f43f5e` (Catalyst Crimson)
  - `surface`: `#110b11` (Basalt Stone)
- **Signal Grammar**:
  ```
  [▓▓▓ GPT-5.6] [▒▒ main] [░ read] [█ 47%]
  ```
- **Motion**: `liquid.rise` — cell density shifts dynamically in response to token consumption rates.

---

## Decoupled Customization Architecture

Presets represent harmonious default pairings, but Wishcraft allows complete independence across every dimension:

```
┌────────────────────────────────────────────────────────┐
│                User Custom Configuration               │
│                                                        │
│  Base Preset:       Lanternwake                        │
│  Signal Layout:     Threadbound                        │
│  Token Palette:     Scryglass                          │
│  Working Motion:    Lunar Breathe                      │
│  Tool Motion:       Heat Propagate                     │
│  Frame Chrome:      Vellum                             │
│  Glyph Set:         Nerd Font (Full)                   │
└────────────────────────────────────────────────────────┘
```
No layer is locked; users can selectively override any aspect without fork or code changes.
