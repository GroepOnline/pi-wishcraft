---
name: wishcraft-ui-components
description: How to build terminal UI in pi-wishcraft. Use when creating or modifying overlays, menus, select lists, keybindings, or any interactive TUI component — to pick the right pi-tui primitives, theme correctly, and avoid known UI pitfalls.
---

# Building UI in wishcraft

## Overlay chrome — start here

`src/extension/ui/overlay-chrome.ts` is the shared overlay skeleton:

- `showSelectOverlay(ctx, title, hint, items, maxVisible)` — filterable
  select overlay; returns the picked `SelectItem` or `null`. Consumers:
  `menu-views.ts`, `token-overlays.ts`.
- `renderOverlayBox` — rounded box + accent title + dim hint.
- `applyOverlayFilter` — substring filter over label + value + description
  (pi's `SelectList.setFilter` is prefix-only on `value`; do not inherit it).
- `overlaySelectListTheme(theme)` / `applyOverlayQueryKey` /
  `isOverlayPrintable` — theme + input helpers.

## pi-tui primitives available

From `@earendil-works/pi-tui`: `SelectList`, `ScrollView`, `SettingsList`,
`Markdown`, `HStack`, `VStack`, `fuzzyFilter`, `truncateToWidth`, and
`matchesKey`. From `@earendil-works/pi-coding-agent`: `Theme`,
`getSelectListTheme()` (also `getSettingsListTheme`, `getMarkdownTheme`).

## Theming

Always derive colors via `getSelectListTheme(theme)` or
`overlaySelectListTheme(theme)` — never hardcode ANSI codes. Theme types come
from `src/theme/`; semantic names map to real colors there.

## DO's

- **`matchesKey(data, "enter" | "escape" | "left" | …)` for all keymaps** —
  see `menu-views.ts`. Never compare raw control bytes.
- **Serve-stale for data**: render last-known values immediately, refresh in
  the background (pattern from `src/git/status.ts`).
- Reuse `renderOverlayBox` / `showSelectOverlay` instead of hand-rolled
  borders.

## DON'Ts

- **No `execSync` in UI code** — it freezes the render loop; spawn async and
  update when the promise lands.
- **No raw ctrl-byte keymaps** (`\x13`, `\x03`, …) — they break with custom
  keybindings; use `matchesKey`.
- **No `verticalAlign` in `overlayOptions`** — that key does not exist in pi-tui's
  `OverlayOptions`. Position with `anchor` (+ `offsetX`/`offsetY`/`row`/`column`).
  Note: `overlay-chrome.ts` still passes it today — don't copy that into new code.

## Reference

Full API inventory: `docs/semantic/API-SURFACE.md` (owned by another agent;
fall back to the `.d.ts` in `node_modules/@earendil-works/pi-tui` if absent).
