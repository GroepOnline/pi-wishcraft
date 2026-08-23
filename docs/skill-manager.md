# Skill workbench

Browse and insert installed skills (`SKILL.md` files and `*.md`/`*.txt` prompts) from one workbench surface:

- **`/skills`** — skill workbench overlay. Split pane: list + metadata + health + usage sparkline + content preview, plus a workflow line (`discover → health → usage → insert`). Type to filter, `tab` cycles category, `ctrl+s` toggles name/usage sort. `↑↓` move, `enter` inserts the selected skill into the prompt, `→` opens the full body, `esc` goes back or closes.
- **Deck Skills route** (`/wishcraft skills` or `g k` from the Deck) — the same workbench inside the Deck frame. `n` opens the wizard; `enter` inserts and closes the Deck.
- **`n` / `ctrl+n`** — new-skill wizard (name → description → template → triggers → confirm). On `/skills`, empty-filter `n`/`N` is the inline wizard; `ctrl+n` still runs `/skills new`. `/skills new <name> [template]` writes `~/.pi/agent/skills/<name>/SKILL.md` from a template (`standard`, `browser-workflow`, `CLI-workflow`, `review-checklist`). Names reject empty values, `..`, and path separators. No GitHub/npm install. The wizard writes the description and trigger list you entered, not only the stock template body.
- **`/skills doctor`** — health table (not an essay): broken or missing frontmatter, descriptions over 240 characters, the same name in global and project, unused skills (usage ledger count 0). `↑↓` navigate, `enter` copies a row, `esc` closes.

The workbench reuses the same skill discovery as inline `/command`/`$skill` triggers, so anything you can inline you can also browse and insert manually. The bundled `skills/wishcraft-tui` skill documents Deck, Signal, motion, and accessibility contracts.
