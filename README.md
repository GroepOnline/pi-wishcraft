# Wishcraft

> **Pi's animated operator layer — intent, skills, ideas, guardrails, and session state made visible and controllable without turning Pi into an IDE.**

Wishcraft is a high-polish terminal extension for the [Pi](https://github.com/badlogic/pi) coding assistant. It combines continuous session awareness, a motion-aware animated powerline (**Signal**), an interactive modal control surface (**Deck**), and integrated workflows for agent skills and guardrails.

---

## The Five Pillars

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ 1. DECK        │ The unified interactive control surface (Alt+P / /wishcraft).   │
│ 2. SIGNAL      │ The motion-aware animated powerline (/signal).                  │
│ 3. MOTION      │ Zero-overhead, event-driven terminal animation engine (0 FPS).  │
│ 4. CRAFT       │ Workflows for Skills, Ideas, Guardrails, and session tools.     │
│ 5. APPEARANCE  │ 10 structural presets, semantic design tokens, Motion Gallery.  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 10 Signature Structural Presets

Wishcraft presets are complete design systems—defining token palettes, frame chrome, signal grammars, and signature procedural animations:

1. **Lanternwake** *(Default)*: Warm amber and glowing embers in a dark sanctuary.
2. **Threadbound**: Artisan tailoring, indigo weave, and traveling stitch pulses.
3. **Scryglass**: Precision optics, cyan/violet glass capsules, and refraction sweeps.
4. **Runebloom**: Organic moss and gold sigils that bloom outwardly upon events.
5. **Moonwell**: Nocturnal silver starlight and smooth lunar orbit breathing.
6. **Hexforge**: Industrial heavy steel block geometry and thermal heat waves.
7. **Vellum**: Editorial dark parchment and real-time calligraphic rule reveals.
8. **Wisp**: Ethereal minimalist whitespace with subtle phase oscillations.
9. **Starweave**: Astrological celestial maps with star particle path traversals.
10. **Crucible**: Dynamic magma and obsidian fluid meter levels.

---

## Architecture & Release Roadmap

Wishcraft vNext is implemented via a strict series of stacked pull requests:

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

See the **[vNext Stacked PR Release Plan](docs/design/vnext-release-plan.md)** for detailed technical specifications.

---

## Quality Invariants

- **0 FPS Idle**: All repeating animations automatically stop when the agent is idle.
- **Universal Fallbacks**: 100% compliant with `NO_COLOR`, reduced motion, and standard ASCII terminals.
- **Non-Invasive**: Executes within Pi's native extension sandbox without hijacking the root transcript.
- **Pure Function Testing**: All motion algorithms and layout geometry are unit-tested without headless UI dependencies.
