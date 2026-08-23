# Deck Layout & Interactive Route Architecture

## Overview

The **Wishcraft Deck** (`Alt+P` / `/wishcraft`) is the central control surface for the agent operator. It replaces fragmented menus with a cohesive, keyboard-first modal overlay built inside `ctx.ui.custom`.

---

## The Continuous Surface Design

Unlike cheap TUIs that stack boxes inside boxes with conflicting borders, the Deck utilizes a **single continuous outer frame** partitioned into an ambient header, the active route viewport, and a contextual footer.

```
╭────────────────────────────── WISHCRAFT DECK ──────────────────────────────╮
│ ◈ GPT-5.6 HIGH        main +12      context 47%        ◆ STREAMING         │
├──────────────┬──────────────────────────────────────┬───────────────────────┤
│ NAVIGATION   │ ACTIVE ROUTE: HOME                   │ ACTIVITY FEED         │
│              │                                      │                       │
│ ◉ Home       │  CURRENT SESSION                     │ 21:16 read_file       │
│ ◆ Signal     │  ◆ Streaming response                │ 21:16 grep_pattern    │
│ ◇ Skills  27 │  ━━━━╾✦╼━━━━━━━━━━━━                 │ 21:15 skill.load      │
│ ◇ Ideas    4 │                                      │                       │
│ ◇ Guardrails │  Context Capacity                    │ SKILLS HEALTH         │
│ ◇ Shell      │  ████████░░░░░ 47% (94k / 200k)      │ ✓ 25 healthy          │
│ ◇ Usage      │                                      │ !  2 warnings         │
│ ◇ Appearance │  NEXT INTENT                         │                       │
│ ◇ Motion     │  Improve Signal motion engine        │ GUARDRAILS            │
│ ◇ Shortcuts  │  [Run]  [Open Skill]  [Review]       │ Policy: STRICT (Enf)  │
├──────────────┴──────────────────────────────────────┴───────────────────────┤
│ / Search     g s Skills     g i Ideas     ? Help     Esc Close Deck         │
╰─────────────────────────────────────────────────────────────────────────────╯
```

---

## Route Catalog & Deep Links

| Route | Deep Link Command | Purpose & Main Components |
| :--- | :--- | :--- |
| **`Home`** | `/wishcraft` / `Alt+P` | Live session overview, intent card, context bar, recent activity stream. |
| **`Signal`** | `/signal` | Visual powerline editor, lane assignments, separator picker. |
| **`Skills`** | `/skills` | Skill catalog, inline creation wizard, health diagnostics. |
| **`Skills Doctor`**| `/skills doctor` | Deep validation of skill frontmatter, descriptions, and triggers. |
| **`Ideas`** | `/ideas` | Rapid capture and organization of intent notes and future tasks. |
| **`Guardrails`** | `/guardrails` | Safety policies, denial logs, execution boundaries. |
| **`Shell`** | `/shell` | Execution environment inspect, tool binary availability. |
| **`Usage`** | `/usage` | Detailed token statistics and context window metrics. |
| **`Appearance`**| `/appearance` | Preset picker, semantic token overrides, layout density. |
| **`Motion`** | `/motion` | Motion Gallery, Composer, accessibility sensitivity sliders. |
| **`Shortcuts`** | `/shortcuts` | Keyboard navigation and jump-mode cheat sheet. |
| **`Diagnostics`**| `/diagnostics` | Terminal capabilities, color support, and encoding checks. |

---

## Navigation Ergonomics

Wishcraft combines **Posting-style jump shortcuts** with a fast **fuzzy command palette**:

1. **Global Jump Keys**:
   - `g h` $\rightarrow$ Jump to Home
   - `g s` $\rightarrow$ Jump to Skills
   - `g i` $\rightarrow$ Jump to Ideas
   - `g a` $\rightarrow$ Jump to Appearance
   - `g m` $\rightarrow$ Jump to Motion
2. **Fuzzy Search Palette (`/`)**:
   - Typing `/` anywhere in the Deck opens the instant search bar.
   - Matches routes, config keys, actions, and skills with real-time highlighted filtering.
3. **Key Hints**:
   - The footer always renders context-relevant shortcuts, eliminating the need to memorize keybindings.
