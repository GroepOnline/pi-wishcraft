# Skill manager

Browse and insert your installed skills (`SKILL.md` files and `*.md`/`*.txt` prompts) from the skill workbench:

- **`/skills`** — open the skill manager overlay. Filter with plain typing, `↑↓` to move, `enter` to open a skill's detail body, `↑↓` in the detail to scroll, `enter`/`tab` to insert the skill content into your prompt, `esc` to go back/close.
- **Deck Skills route** (`/wishcraft skills` or `g k` from the Deck) — split pane: list + metadata + health + usage sparkline + content preview, plus a workflow line (`discover → health → usage → insert`).
- **`n` / `ctrl+n`** — inline new-skill wizard (name, description, template, triggers, confirm). `/skills new <name> [template]` still writes `~/.pi/agent/skills/<name>/SKILL.md` from a template (`standard`, `browser-workflow`, `CLI-workflow`, `review-checklist`). Names reject empty values, `..`, and path separators. No GitHub/npm install.
- **`/skills doctor`** — health table (not an essay): broken or missing frontmatter, descriptions over 240 characters, the same name in global and project, unused skills (usage ledger count 0). `↑↓` navigate, `enter` copies a row, `esc` closes.

The workbench reuses the same skill discovery as inline `/command`/`$skill` triggers, so anything you can inline you can also browse and insert manually. The bundled `skills/wishcraft-tui` skill documents Deck, Signal, motion, and accessibility contracts.
