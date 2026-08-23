# Wishcraft vNext — Architecture & Product Overview

## Vision

> **Wishcraft is Pi’s animated operator layer — intent, skills, ideas, guardrails, and session state made visible and controllable without turning Pi into an IDE.**

In August 2026, terminal interfaces have moved far beyond static tables and rudimentary ASCII menus. Modern developer tools (PiTTy, Crush, OpenTUI, Drift, Termflix, Copilot CLI) demonstrate that terminal software can combine rich aesthetics with responsive, ergonomic workflows.

Wishcraft vNext does not seek to replace Pi or turn it into a bloated, monolithic IDE. Instead, it acts as a **continuous operator layer**—a polished companion that weaves status, motion, craft, and control directly into terminal workflows.

```
┌────────────────────────── WISHCRAFT CONTINUOUS SURFACE ──────────────────────────┐
│ ◈ AMBIENT HEADER: Model / Git Branch / Session Context / Active State            │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│                                ACTIVE DECK ROUTE                                 │
│                   (Home · Signal · Skills · Ideas · Appearance)                  │
│                                                                                  │
├──────────────────────────────────────────────────────────────────────────────────┤
│ ❖ ANIMATED SIGNAL: ╾━━━━ main ━━━━╾✦╼━━━━ read_file ━━━━━━━ ctx █████░ 47%       │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## The Five Pillars

### 1. Deck (`Alt+P` / `/wishcraft`)
The Deck is the primary control surface for the agent operator. It provides a focused modal interface hosting structured routes for session management, tool inspections, skill workflows, and deep customization. Built using `ctx.ui.custom`, the Deck renders inside a single unified continuous outer frame, avoiding cluttered nested cards.

### 2. Signal (`/signal`)
Signal is Wishcraft's signature animated powerline. Configured with three independent lanes (*Left: Identity/Git*, *Center: Live Activity*, *Right: Metrics/Queue*), Signal provides continuous at-a-glance awareness. During active tasks (such as token streaming or tool execution), Signal dynamically pulses or sweeps along its connective track.

### 3. Motion
A centralized, event-driven terminal animation engine. Rather than scattering uncoordinated timers across components, a single unified scheduler drives visual channels with dedicated cadences. When the system is idle, the scheduler rests at **0 FPS**, eliminating CPU overhead.

### 4. Craft
Workflows for managing agent capabilities:
- **Skills**: Discover, inspect health, execute, and author skills using an inline wizard.
- **Ideas**: Quick capture and organization of thoughts and intents.
- **Guardrails**: Policy inspection and execution safety gates.

### 5. Appearance
Ten structural presets that define distinct layout personalities, semantic design tokens, glyph grammars, and signature motion languages. Presets serve as cohesive starting points, but users remain free to decouple and customize every layer individually.

---

## Architectural Boundaries

To ensure maximum stability, performance, and compatibility with the Pi ecosystem, Wishcraft enforces strict architectural boundaries:

1. **Pi-Native Extensibility**: Wishcraft executes inside the standard Pi extension runtime. It does not attempt to hijack or replace Pi's root TUI transcript or editor.
2. **Overlay Control Surface**: The Deck operates as an overlay via `ctx.ui.custom`. Closing the Deck immediately returns full focus to the standard Pi transcript.
3. **No Mouse on Live Footer**: Pi renders the terminal footer as static text. Signal avoids fragile terminal mouse interceptors on the live footer, reserving rich pointer and keyboard interactions for the Deck.
4. **Performance & CPU Budget**: Animations are strictly tied to real session events. When the agent is idle and no ambient animations are configured, all timers are cleared to achieve 0% CPU consumption.
