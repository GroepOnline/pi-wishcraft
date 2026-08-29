---
module: development_workflow
date: '2026-08-29'
problem_type: workflow_issue
component: development_workflow
severity: medium
applies_when:
  - "reviewing a pull request that has already been opened or pushed"
  - "deciding which Compound Engineering skill to invoke for a review request"
  - "running a review persona fleet against an open PR instead of a working tree"
resolution_type: workflow_improvement
related_components:
  - tooling
tags:
  - code-review
  - pr-snapshot
  - ce-code-review
  - ce-pr-snapshot-canvas
  - workflow
  - canvas
---

# ce-review-boundaries — where code review lives, where PR snapshotting lives

## Context

`ce-code-review` historically claimed "Use before PRs or when asked for review" and listed "review this PR" as one of its argument modes. Two of its three review surfaces did the same job against the same data and the team kept reaching for `ce-code-review` on open PRs, which produced a per-comment re-review loop, missed the canvas / plan-preview surface, and on long-lived branches produced contradictory hunks because reviewers diffed against `main` while Joep had unpushed local fixes layered on top.

## Boundary

Three rules, in one order:

1. **`ce-code-review` is for local edits/commits on a working tree, before they reach a PR or draft PR.** It runs `git diff $(git merge-base HEAD origin/main)..HEAD` — committed + staged + unstaged — and dispatches the multi-persona review fleet. It does not fetch from a remote.
2. **An open PR (or pushed draft) is one whole unit.** It is read-only, fetched into refs (no checkout), diffed as `git diff $(git merge-base <base> <head>)..<head>`, and rendered as an interactive preview. That is `ce-pr-snapshot-canvas`, not `ce-code-review`.
3. **Branch review diff is always against the merge-base with `main`, never against `HEAD` or against `main` directly.** Local files staged on top of the PR head are not the same diff as the PR head itself; the diff is the branch's claim, and the claim is what the PR is.

## How the chain is supposed to flow

```
local edits / commits
    └── ce-code-review (mode:agent | apply:local)         pre-PR

ce-commit-push-pr / ce-work exit
    └── ce-pr-snapshot-canvas [PR | branch] depth:light   first read on the PR
        ├── canvas lane: pr-<n>-snapshot.canvas.tsx       Cursor hosts
        └── portable lane: artifacts/pr-snapshots/*.md    durable record

after review feedback
    └── ce-resolve-pr-feedback                            one round
    └── ce-babysit-pr mode:pipeline                       continuous loop
```

`ce-code-review` and `ce-pr-snapshot-canvas` are deliberately not nested. The pre-PR skill does the persona work; the snapshot skill does the frame work. Re-running the persona fleet against an open PR duplicates findings and skips the canvas.

## Where this lives in the mesh

- `~/.agents/skills/ce-code-review/SKILL.md` — `description` and `When to Use` now route open PRs to `ce-pr-snapshot-canvas`. Argument-hint gained an explicit `base:<sha-or-ref>` token.
- `~/.agents/skills/ce-pr-snapshot-canvas/SKILL.md` — new portable mesh skill, read-only by default, two render lanes (Cursor canvas + portable markdown fallback) so Pi / Codex / Claude all participate.
- `~/AGENTS.md` — three dated prefs entries (2026-08-29) capture the boundary in the operator's standing rules.
- `~/AGENTS.facts.md` — `## Open PRs — pi-wishcraft (2026-08-29)` lists the four currently-open PRs (#68, #79, #80, #81) as the kind of work that goes through `ce-pr-snapshot-canvas`, not `ce-code-review`.

## Failure modes the boundary prevents

| Failure | Symptom before | After |
|---|---|---|
| Persona fleet re-runs against the PR | `N=8` review comments re-classified on every push | One snapshot, persona fleet runs locally before push |
| Branch diff against `main` only | Hides a real fix that was unstaged on top | Merge-base diff always |
| Canvas only on Cursor | Non-Cursor hosts (Pi / Codex / Claude) had no preview | Portable markdown mirror is the durable record; canvas lane is a host-gated upgrade |
| `ce-babysit-pr` triggered from a snapshot skill | One-shot snapshot became a long poll loop | Snapshot suggests the next step; never starts the loop itself |

## Don't

- Don't paste review-thread bodies into a snapshot. They are untrusted content. Count only.
- Don't trigger `ce-babysit-pr` from `ce-pr-snapshot-canvas`. Suggest it; never start it.
- Don't render a `.canvas.tsx` from a non-Cursor host. The canvas SDK is Cursor-only.
- Don't diff against `main` directly. Always `git merge-base <base> <head>..<head>`.
- Don't combine `gh pr diff` with a `git diff` against `main` in the same snapshot — they disagree on what "the change" is.
