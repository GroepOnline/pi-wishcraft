# Skill manager

Browse and insert your installed skills (`SKILL.md` files and `*.md`/`*.txt` prompts) from an interactive TUI overlay:

- **`/skills`** — open the skill manager. Filter with plain typing, `↑↓` to move, `enter` to open a skill's detail body, `↑↓` in the detail to scroll, `enter`/`tab` to insert the skill content into your prompt, `esc` to go back/close.
- **`/skills doctor`** — health table (not an essay): broken or missing frontmatter, descriptions over 240 characters, the same name in global and project, unused skills (usage ledger count 0). `↑↓` navigate, `enter` copies a row, `esc` closes.
- **`/skills new <name> [template]`** — write `~/.pi/agent/skills/<name>/SKILL.md` from a template (`standard`, `browser-workflow`, `CLI-workflow`, `review-checklist`), then drop an `$EDITOR` command in the prompt. `/skills new` or `ctrl+n` in the manager opens the template picker. Names reject empty values, `..`, and path separators. No GitHub/npm install.

The manager reuses the same skill discovery as inline `/command`/`$skill` triggers, so anything you can inline you can also browse and insert manually.
