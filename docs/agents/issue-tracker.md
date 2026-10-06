# Issue tracker: Linear + GitHub

This repo uses a dual-tracker workflow:
- **Linear**: Long-term planning, roadmap, feature tracking
- **GitHub**: Bug reports, PR-linked issues, immediate triage

## Conventions

### GitHub (primary for bugs and triage)
- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v`; `gh` does this automatically when run inside a clone.

### Linear (for planning and features)
- **Create a ticket**: `linear issue create --title "..." --description "..." --team <team-id>`. Use `linear teams list` to find team IDs.
- **Read a ticket**: `linear issue view <ticket-id>` or `linear issue search --query "<title>"`.
- **List tickets**: `linear issue list --team <team-id> --state <state>` with appropriate filters (e.g., `--state Backlog`, `--state In Progress`).
- **Comment on a ticket**: `linear comment create <ticket-id> --body "..."`
- **Change state**: `linear issue update <ticket-id> --state <state>`
- **Assign**: `linear issue update <ticket-id> --assignee <user-id>`
- **Link to GitHub**: Add a GitHub issue URL in the Linear ticket description, or use Linear's GitHub integration if configured.

Use Linear for feature planning, roadmap items, and long-term tracking. Reference Linear tickets in GitHub issue bodies when applicable. Link GitHub PRs to related Linear tickets for traceability.

### Linear conventions

**Labels** (create in Linear):
- `type:feature` — New features or enhancements
- `type:bug` — Bugs that belong in the roadmap (not urgent)
- `type:refactor` — Technical debt or architectural work
- `type:research` — Investigation or exploration tasks
- `priority:high` / `priority:medium` / `priority:low` — Priority levels

**States** (use Linear's default workflow or customize):
- `Backlog` — Planned but not started
- `In Progress` — Active work
- `In Review` — Awaiting review
- `Done` — Completed
- `Canceled` — Declined or superseded

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments` then keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` (drop `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either: resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

**Use GitHub when:**
- Bug reports or regressions
- Urgent issues requiring immediate triage
- PR-linked issues or feedback from code review
- Questions or clarifications about implementation

**Use Linear when:**
- Feature proposals or enhancements
- Roadmap items or long-term planning
- Research tasks or investigations
- Technical debt or architectural refactoring
- Multi-step work that benefits from project tracking

If unsure, default to GitHub for bugs/immediate work, Linear for features/planning.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments` for GitHub issues. For Linear tickets, use the Linear CLI or API.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single Linear ticket with **child** tickets as tasks.

- **Map**: a single Linear ticket labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `linear issue create --title "Map: <topic>" --description "..." --team <team-id> --label wayfinder:map`.
- **Child ticket**: a Linear ticket linked to the map as a parent using Linear's parent-child relationship. Add the child to the map's sub-issues and put `Part of <map-id>` at the top of the child description. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: Use Linear's **native issue dependencies**. Add a blocker with `linear issue update <child> --blocking <blocker-id>`. Linear reports blocking status in the UI. A ticket is unblocked when every blocker is resolved.
- **Frontier query**: list the map's open children (`linear issue list --team <team-id> --parent <map-id> --state Backlog,In Progress`), drop any with an open blocker or an assignee; first in map order wins.
- **Claim**: `linear issue update <ticket-id> --assignee @me`, the session's first write.
- **Resolve**: `linear comment create <ticket-id> --body "<answer>"`, then `linear issue update <ticket-id> --state Done`, then append a context pointer (gist + link) to the map's Decisions-so-far.
