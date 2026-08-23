# Wishcraft Roadmap & Engineering Invariants

## Vision

Wishcraft is Pi’s animated operator layer — intent, skills, ideas, guardrails, and session state made visible and controllable without turning Pi into an IDE.

---

## Architectural Ground Rules & Non-Goals

1. **No Third Control Surface**:
   - Wishcraft operates cleanly inside Pi’s custom UI extension capabilities (`ctx.ui.custom`).
   - The Deck is a focused modal overlay that returns focus to the standard Pi transcript upon closing.
2. **No Mouse on Live Footer**:
   - Pi core renders the terminal footer as static text. Signal avoids fragile terminal mouse listeners on the live powerline.
3. **English UI Strings**:
   - All user-facing labels, key hints, and error dialogues are authored in clean, professional English.
4. **Pure Function Testability**:
   - Visual mathematics, color conversions, token mapping, and preset resolution must remain pure functions testable without headless UI dependencies.

---

## vNext Milestone: The Stacked PR Plan

The complete vNext architecture is detailed in **[`docs/design/vnext-release-plan.md`](docs/design/vnext-release-plan.md)** and executed across 9 stacked pull requests:

```mermaid
graph LR
  PR0["PR0: Design Corpus"] --> PR1["PR1: Motion Engine"]
  PR1 --> PR2["PR2: Semantic Tokens"]
  PR2 --> PR3["PR3: Preset Contract"]
  PR3 --> PR4["PR4: Animated Signal"]
  PR4 --> PR5["PR5: Wishcraft Deck"]
  PR5 --> PR6["PR6: Appearance & Gallery"]
  PR6 --> PR7["PR7: First-Class A11y"]
  PR7 --> PR8["PR8: Craft, Skills & Docs"]
```

### Stacked PR Specifications

- **PR 0: Design Corpus & Specifications** *(In Progress)*
  - Land full design documentation in `docs/design/`.
  - Reconcile the repeating motion scheduler with the 0 FPS idle guarantee.
  - Formalize the Deck overlay boundary under `ctx.ui.custom`.

- **PR 1: Semantic Motion Engine & Scheduler**
  - Create `src/motion/` subsystem.
  - Generalize coalescing timers into a multi-cadence repeating scheduler (`80ms - 120ms` sweeps, `250ms - 750ms` ambient).
  - Implement strict 0 FPS idle teardown.
  - Define `MotionEvent` union and channel router.

- **PR 2: Semantic Design Tokens (`WishcraftTokens`)**
  - Implement token-driven architecture (`surface`, `text`, `primary`, `accent`, `motionHot`, etc.).
  - Map legacy `SemanticColor` keys to tokens with 100% backward compatibility.

- **PR 3: Preset Contract & 10 Signature Presets**
  - Extend `PresetDef` with optional structural specifications (`tokens`, `chrome`, `signal`, `motion`, `glyphs`).
  - Implement the 10 presets: *Lanternwake*, *Threadbound*, *Scryglass*, *Runebloom*, *Moonwell*, *Hexforge*, *Vellum*, *Wisp*, *Starweave*, *Crucible*.

- **PR 4: Animated Signal (Powerline vNext)**
  - Rebuild powerline into 3 configurable lanes (Identity/Git, Live Activity, Context/Queue).
  - Connect live sweeps to the motion engine.
  - Introduce `/signal` as primary preferred command with `/powerline` alias.

- **PR 5: The Wishcraft Deck**
  - Implement unified modal overlay under `src/extension/ui/deck/` bound to `Alt+P` / `/wishcraft`.
  - Build live `Home` route, `Signal` configurator, `Skills` explorer, and deep-link routing.

- **PR 6: Appearance Route, Motion Gallery & Composer**
  - Build Appearance sub-routes and interactive Motion Gallery (50+ animations across 4 categories).
  - Implement the Motion Composer for real-time timeline editing.
  - Introduce fuzzy search configurator (`/ appearance search`).

- **PR 7: First-Class Accessibility & Fallbacks**
  - Implement global motion sensitivity levels (`Full`, `Reduced`, `Functional`, `Off`).
  - Provide complete degradation for `NO_COLOR`, screen readers, and ASCII-only terminals.
  - Directly closes P1 Gap #4.

- **PR 8: Skill Workbench, wishcraft-tui Skill & Complete Docs**
  - Elevate Skill Manager to a full split-pane workbench with inline creation wizard.
  - Package `skills/wishcraft-tui/` with complete reference library.
  - Finalize all documentation and release gates.
