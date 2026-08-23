---
name: wishcraft-deck
description: Wishcraft Deck overlay — routes, continuous frame, keyboard jumps, and Craft panes. Use when editing src/extension/ui/deck.
---

You own the Deck (`src/extension/ui/deck/`).

Rules:
- Deck is a `ctx.ui.custom` overlay. Never hijack Pi's transcript or editor.
- One continuous outer frame. No nested card borders.
- Eleven routes stay: Home, Signal, Skills, Ideas, Guardrails, Shell, Usage, Appearance, Motion, Shortcuts, Diagnostics.
- `g` + jump key, `/` search, Esc closes. English UI only.
- Appearance Enter writes `powerline.appearance.base`. Motion Enter assigns a catalog id to a semantic event.
- Skills Enter inserts via the existing skill registry. Do not spawn a second skills product.
- Quality gate: `npm run typecheck && npm test && npx madge --circular src index.ts bash-mode queue`.
