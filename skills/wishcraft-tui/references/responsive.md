# Responsive Layout & Terminal Viewport Adaptations

## Overview

Terminal viewports vary significantly across devices, window panes, and split layouts. Wishcraft dynamically responds to viewport width and height constraints through intelligent layout degradation.

---

## Responsive Breakpoints

| Viewport Width | Class | Layout Strategy |
| :--- | :--- | :--- |
| **$\ge 120$ cols** | **Wide** | Full 3-column Deck (Nav + Main View + Sidebar) + Full 3-Lane Signal |
| **$80 - 119$ cols**| **Standard**| 2-column Deck (Nav + Main View) + Standard 3-Lane Signal |
| **$50 - 79$ cols** | **Compact** | 1-column Deck (Collapsible Nav) + Compressed 2-Lane Signal |
| **$< 50$ cols**    | **Minimal** | Modal Stack Deck + Single-Lane Essential Status |

---

## Signal Lane Degradation

```
Wide (120+ cols):
◆ GPT-5.6 ╾━━━━ main (clean) ━━━━╾✦╼━━━━ read_file: src/render/powerline.ts ━━━━━━━ ctx █████░ 47% (94k)

Standard (80-119 cols):
◆ GPT-5.6 ╾━━━━ main ━━━━╾✦╼━━━━ read_file ━━━━━━━ ctx 47%

Compact (50-79 cols):
◆ GPT-5.6 ── main ── read ── 47%

Minimal (< 50 cols):
◆ GPT-5.6 · 47%
```

---

## Deck Viewport Adaptations

1. **Wide Viewport ($\ge 120$ cols)**:
   - Navigation pane (20% width)
   - Route workspace (55% width)
   - Activity feed & health sidebar (25% width)
2. **Standard Viewport ($80 - 119$ cols)**:
   - Sidebar collapses into tabbed secondary panes.
   - Main workspace expands to utilize 75% width.
3. **Compact Viewport ($50 - 79$ cols)**:
   - Top-level route icons replace full text navigation.
   - Main workspace occupies full width.
   - Jump shortcuts remain fully active.
4. **Vertical Constraints ($< 24$ rows)**:
   - Ambient header and footer padding are compacted to single rows.
   - Activity stream truncates to most recent 2 events.
