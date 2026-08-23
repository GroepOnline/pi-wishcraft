---
name: wishcraft-tui
description: Design, implement, inspect, and review high-polish Terminal User Interfaces (TUI), motion systems, presets, and powerline layouts for Pi-Wishcraft vNext. Use when building or auditing terminal components, animation frames, semantic design tokens, or responsive layouts.
---

# Wishcraft TUI Design & Engineering Skill

This skill provides expert knowledge and strict design constraints for building, maintaining, and testing Wishcraft vNext—Pi's animated operator layer.

## When to Use

- Developing or reviewing Deck overlay routes (`Home`, `Signal`, `Skills`, `Ideas`, `Appearance`, etc.).
- Authoring or tweaking procedural terminal animations, motion frames, or the `MotionScheduler`.
- Modifying `WishcraftTokens`, semantic color mappings, or the 10 structural presets.
- Implementing responsive layout breakpoints and graceful environmental fallbacks (`NO_COLOR`, ASCII, reduced motion).
- Writing pure-function unit tests and snapshot verifications for terminal output.

---

## Core Invariants

1. **Pi-Native Extension Architecture**:
   - The Deck runs as an overlay via `ctx.ui.custom`. Never attempt to hijack Pi's root transcript or text editor.
   - Live footers are rendered by Pi as static text; never attach mouse listeners to the live footer.
2. **Continuous Outer Frame**:
   - Use a single outer bounding box for the Deck. Never nest cards inside boxes with redundant borders.
3. **0 FPS Idle Guarantee**:
   - Timers must be torn down completely when the agent is idle and no active consumers exist.
4. **Token-Driven Theming**:
   - Colors must resolve through `WishcraftTokens`. Never hardcode raw hex codes in component files.
5. **Universal Fallback Support**:
   - Every custom Unicode/Nerd Font glyph must provide a clean, 1-to-1 ASCII equivalent.

---

## Reference Documentation

Consult the specialized references under `references/` for detailed contracts and specifications:

- `references/product-language.md` — The five pillars, product terminology, and visual metaphors.
- `references/deck-layout.md` — Deck continuous frame specs, route catalog, and keyboard shortcuts.
- `references/signal.md` — 3-lane powerline architecture and live activity motion sweeps.
- `references/motion-system.md` — `MotionEvent` definitions, channel routing matrix, and scheduler design.
- `references/motion-gallery.md` — Animation catalog and Motion Composer parameter guide.
- `references/theme-contract.md` — `WishcraftTokens` schema and `PresetDef` extension fields.
- `references/accessibility.md` — Motion sensitivity levels and `NO_COLOR` / ASCII degradation matrix.
- `references/responsive.md` — Width breakpoints (`120+`, `80-119`, `50-79`, `<50`) and height adaptations.
- `references/regression-testing.md` — Pure unit testing patterns, golden snapshots, and circular dependency checks.
