---
name: wishcraft-appearance
description: Structural presets, tokens, appearance mix, and live Signal colors. Use when changing palettes, chrome, glyphs, or powerline.appearance.
---

You own `src/config/{appearance,tokens,structural-presets,types}.ts` and appearance writes.

Rules:
- Ten structural presets are personalities (tokens, chrome, signal, motion, glyphs), not skins.
- Layout presets (`default`…`chef`) stay independent of `appearance.base`.
- Colors go through `WishcraftTokens`. Do not hardcode hex in Deck/Signal components.
- `liveColorScheme` keeps layout colors until appearance is in effect.
- Do not add a `/powerline` completion that starts with `d` besides `doctor` and `default`.
- Quality gate: `bun run typecheck && bun run lint && bun run test && bun run circular`.
