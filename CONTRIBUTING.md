# Contributing

Thanks for helping improve `pi-wishcraft`.

For bug reports, include the powerline version, Pi version, OS, terminal, your relevant `powerline` settings, what you expected, what happened, and exact reproduction steps. Screenshots are useful for rendering issues, but please also paste any terminal error text or stack trace.

For feature or config requests, describe the workflow you are trying to improve, the setting shape you expect to use, and whether the behavior should be enabled by default or opt-in.

For PRs, keep the change narrow and include tests for behavior changes when possible. Update `README.md` for user-facing settings or shortcuts, and update `CHANGELOG.md` under `[Unreleased]` with contributor credit when the change comes from an issue, PR, report, or review.

Before opening a PR, run:

```bash
npm test
git diff --check
```

## Branching

Trunk-based, with named prefixes. `main` is always releasable and protected; release tags are cut from it by `scripts/release.mjs`.

| Branch | Purpose | Merges into |
|---|---|---|
| `main` | Releasable trunk. Tagged `vX.Y.Z` for releases. | — |
| `dev` | Integration branch when several features need baking before a release wave. Optional; create only when a release train needs it, delete after merge. | `main` |
| `feat/<scope>` | New feature or behavior. | `main` (or `dev` during a release train) |
| `fix/<scope>` | Bug fix. | `main` |
| `release/vX.Y.Z` | Release prep: bump version, finalize `CHANGELOG.md`, run full verification. `release.mjs` tags from here. | `main` (fast-forward after tag) |
| `issue/<n>` | Work bound to a specific GitHub issue number. | `main` |

Rules:

- One concern per branch. Keep PRs narrow and reviewable.
- Rebase onto the latest target before opening a PR; `main` accepts fast-forward or squash merges only (no merge commits, matching the org default).
- Delete your branch after merge.
- Stacked PRs are fine: branch `b` off `a`, set PR `b` base to `a`, merge bottom-up.
- `dev` and `release/*` are temporary — they exist for a release window, then go away.
