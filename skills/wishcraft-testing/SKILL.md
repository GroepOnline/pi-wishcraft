---
name: wishcraft-testing
description: Testing conventions for pi-wishcraft. Use when writing, running, or reviewing tests — to pick the right runner invocation, match the node:test style, know which contract tests guard repo invariants, and check typecheck/circular-dependency gates.
---

# Testing wishcraft

## Runner

Plain **node:test** with type stripping — there is no build step:

```sh
npm test        # node --experimental-strip-types --test tests/**/*.test.ts
```

Tests live flat in `tests/*.test.ts` (55+ files), importing `src/` directly
via relative `.ts` paths. No test framework config, no fixtures pipeline
beyond `tests/fixtures/`.

## Contract tests (repo invariants)

These fail CI when docs/metadata drift from code — update them together:

- `tests/readme-contract.test.ts` — README documents what exists
- `tests/package-metadata.test.ts` — package.json scripts/exports consistent
- `tests/github-workflows.test.ts` — workflow files stay valid
- `tests/english-ui.test.ts` — user-facing strings stay English

## Gates besides tests

```sh
npm run typecheck   # tsc --noEmit
npm run circular    # madge --circular src index.ts bash-mode queue
```

Both are release gates; new imports must not introduce cycles.

## Writing a test

Mirror the module name (`src/git/status.ts` → `tests/git-status.test.ts`),
use `node:test`'s `describe`/`it`/`assert`, and prefer testing exported
pure functions. For async/background behavior (serve-stale caches), drive the
exported invalidation functions rather than timers.

## Known untested modules (good first coverage targets)

- `src/extension/history/prompt-history.ts`
- `src/extension/settings/settings-io.ts`
- `src/extension/ui/status-line-renderers.ts`
- `src/welcome/discover.ts`, `src/welcome/sessions.ts`
- `src/extension/commands/vibe-command.ts`
- `src/extension/ui/token-overlays.ts`
- `src/extension/history/stash-history.ts`
- `src/extension/session/git-invalidation.ts`

## Reference

Semantic docs: `docs/semantic/` (`MAP.md`, `API-SURFACE.md`,
`HOT-PATHS.md`) — owned by another agent; consult if present.
