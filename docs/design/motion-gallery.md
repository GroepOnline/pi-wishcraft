# Motion Gallery & Composer Specification

## Overview

The **Motion Gallery** provides an interactive catalog of animations categorized across curated styles. The **Motion Composer** allows developers and power users to author, preview, and assign custom motion definitions directly inside the terminal interface.

---

## Gallery Categories

```
╭─ Motion Gallery ─────────────────────────────────────────────────────────────╮
│ / Search motions (e.g. "lunar", "sweep", "ember")                             │
├──────────────────────────────────────────────────────────────────────────────┤
│ Wishcraft         Matrix          Procedural        Classic        Custom    │
│                                                                              │
│ ◈ Ember Relay     ∞ Lemniscate    ⠿ Helix Phase     ⠋ Braille      ✦ User-1  │
│ ◇ Wisp Drift      ◎ Lunar Orbit   ≋ Wave Stream     ◐ Quarter                │
│ ✦ Sigil Bloom     △ Wing Pulse    ⡿ Orbital Spin   ▏ Bar Fill               │
│ ⬡ Heat Propagate  ✧ Petal Shimmer ≋ Ripple Surface  ● Bounce                 │
├──────────────────────────────────────────────────────────────────────────────┤
│ PREVIEW:                                                                     │
│                                                                              │
│                 ━━━━━━╾✦╼━━━━━━━━━━━━━                                       │
│                          → 90ms                                              │
│                                                                              │
│ Channels: [✓] Working Glyph   [✓] Signal Track   [ ] Transient   [✓] Task    │
├──────────────────────────────────────────────────────────────────────────────┤
│ Space Play/Pause   E Edit in Composer   D Duplicate   F Favorite   Enter Apply│
╰──────────────────────────────────────────────────────────────────────────────╯
```

### 1. Wishcraft (Signature Metaphors)
- `ember-relay`: Traveling spark across segmented track.
- `wisp-drift`: Subtle breathing glyph with gentle phase oscillation.
- `sigil-bloom`: Expanding concentric geometry that settles upon completion.
- `heat-propagate`: Thermal matrix diffusion across block elements.

### 2. Matrix (Geometrical & Celestial)
- `lemniscate`: Infinity figure-eight traversal.
- `lunar-orbit`: Sinusoidal orbital node path.
- `wing-pulse`: Dual metronome oscillation.
- `petal-shimmer`: Expanding and contracting radial points.

### 3. Procedural (Fluid & Wave Mechanics)
- `helix-phase`: Intertwined dual-strand cycle.
- `wave-stream`: Progressive sine wave amplitude sweep.
- `ripple-surface`: Concentric wavefront propagation.

### 4. Classic (Reliable Terminal Spinners)
- `braille-cycle`: Canonical 8-dot Braille loop (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`).
- `quarter-circle`: Rotating four-quadrant glyphs (`◐◓◑◒`).
- `bar-fill`: Smooth horizontal bar progression (`▏▎▍▌▋▊▉█`).

---

## Motion Composer

The Composer enables real-time parameter tweaking and frame array authoring:

```
╭─ Motion Composer: Ember Relay ───────────────────────────────────────────────╮
│ TIMELINE                                                                     │
│ 0ms          90ms         180ms        270ms        360ms                    │
│ ├───◇──────────├───◈──────────├───◆──────────├───◈──────────├───◇────────────│
│                                                                              │
│ PARAMETERS                                                                   │
│ Geometry:        Linear Track (1D)                                           │
│ Interval:        90 ms                                                       │
│ Direction:       Forward (→)                                                 │
│ Easing:          Sinusoidal Pulse                                            │
│ Color Role:      motionHot (#fbbf24)                                         │
│ Fallback Glyph:  ◆                                                           │
│                                                                              │
│ ASSIGNED CHANNELS                                                            │
│ [*] Working Glyph   [*] Signal Track   [ ] Border   [*] Task Status          │
├──────────────────────────────────────────────────────────────────────────────┤
│ Ctrl+S Save   Tab Next Field   Space Test   Esc Discard                      │
╰──────────────────────────────────────────────────────────────────────────────╯
```
