# First-Class Accessibility & Graceful Degradation

## Overview

Terminal environments vary drastically—from modern GPU-accelerated terminals with full truecolor and Nerd Font glyphs to low-bandwidth SSH sessions, restricted 8-color virtual consoles, and screen readers.

Wishcraft treats accessibility and environmental adaptability as first-class architectural constraints, directly resolving ROADMAP P1 Gap #4.

---

## Motion Levels

Users can configure global motion sensitivity via settings or keyboard shortcuts:

```
Motion Sensitivity:
(●) Full              - Continuous sweeps, micro-spinners, and transitions
( ) Reduced           - Instant state changes; continuous loops replaced by static glyphs
( ) Functional Only   - Task indicators active; decorative ambient motion disabled
( ) Off               - 100% static display; zero animated frames
```

---

## Environment Degradation Matrix

```
┌───────────────────┬───────────────────┬───────────────────┬────────────────────┐
│ ENVIRONMENT       │ MOTION BEHAVIOR   │ COLOR PALETTE     │ GLYPH RENDERING    │
├───────────────────┼───────────────────┼───────────────────┼────────────────────┤
│ Modern Truecolor  │ Full FPS & Sweeps │ True 24-bit RGB   │ Full Nerd Fonts    │
│ Standard 256 Color│ Full FPS & Sweeps │ ANSI-256 Mapped   │ Unicode / Nerd     │
│ Basic 8/16 Color  │ Simplified Pulse  │ Basic ANSI        │ Clean ASCII        │
│ NO_COLOR Set      │ Glyphs Active     │ No ANSI Escapes   │ Unicode / ASCII    │
│ prefers-reduced   │ Discrete States   │ Full Color        │ Standard Glyphs    │
│ Screen Reader     │ Disabled (0 FPS)  │ High Contrast     │ Descriptive Text   │
└───────────────────┴───────────────────┴───────────────────┴────────────────────┘
```

---

## Concrete Degradation Policies

### 1. `NO_COLOR` Compliance
When the `NO_COLOR` environment variable is detected:
- All ANSI color codes and RGB background styling are stripped.
- Spatial layout, separators, and glyph animations remain active to convey status through structure.

### 2. `prefers-reduced-motion`
When reduced motion is requested by the OS or user configuration:
- Continuous sweeps along the Signal track are disabled.
- Spinners transition immediately to static state markers (`[..]`, `[ok]`, `[!]`).
- Transient notifications appear statically without fade-in or slide-in transitions.

### 3. Screen Reader Mode
- Motion engine is completely stopped (0 FPS).
- Powerline separators and visual spacers are suppressed.
- Status is formatted as clean, semantic plain text (e.g. `Model: GPT-5.6 | Git: main (clean) | State: Streaming | Context: 47%`).

### 4. ASCII Fallback Strategy
Every custom Unicode icon and Nerd Font symbol provides a guaranteed 1-to-1 ASCII equivalent:

| Semantic Icon | Nerd Font Glyph | Unicode Default | ASCII Fallback |
| :--- | :--- | :--- | :--- |
| Model | `󰚩` | `◈` | `[*]` |
| Git Branch | `` | `⎇` | `branch:` |
| Git Clean | `✔` | `✓` | `ok` |
| Git Dirty | `✎` | `⚡` | `*` |
| Streaming | `󱐋` | `✦` | `~` |
| Tool Call | `󰒓` | `◆` | `>` |
| Error | `󰅚` | `✗` | `ERR` |
