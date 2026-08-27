# AGENTS.md

Guidance for AI agents (and humans) working on this repository.

## What this project is

pi-wishcraft is a powerline-style status bar and wishcraft interaction layer for the `pi`
coding agent: status segments, welcome overlay/header, working "vibes" loading
messages, a queue + idea inbox, bash mode, prompt/stash history, and full
user customization.

## Repository layout

- `index.ts` — package entry: the public barrel. It re-exports the default
  activation function and the documented public API (`resolveShortcutConfig`,
  `parseBashModeSettings`, `PowerlineShortcuts`). Keep it a barrel; no
  implementation lives here.
- `src/` — the proxy-free extension runtime, organized by domain:
  - `src/extension/` — the extension runtime, organized into domain subfolders:
    `core/` (constants, types, `state.ts` hub, segment-context), `commands/`
    (slash commands, queue commands, bash-mode actions, vibe command),
    `session/` (activation, session lifecycle, git invalidation, stale-context),
    `ui/` (custom editor, layout, menu views, powerline widgets, status-line
    renderers), `history/` (prompt + stash history), `queue/` (queue context +
    integration), `settings/` (settings IO), `shortcuts/` (shortcut config +
    router), `welcome/` (welcome control + integration), `skills/` (inline
    invocation). Leaf modules keep the dependency graph acyclic: shared types
    and constants live in `core/`, queue/welcome callbacks are wired through
    leaves or `RuntimeState`, and `core/state.ts` is the hub that only has
    inbound edges. Verify with `npx madge --circular src index.ts bash-mode
    queue`.
  - `src/config/` — powerline config parsing, presets, types, segment ids/options.
  - `src/segments/` — segment registry and the segment renderers.
  - `src/theme/` — colors, icons, separators, theme loading.
  - `src/usage/` — token stats, context usage, currency rates.
  - `src/welcome/` — welcome header/overlay rendering and discovery.
  - `src/working-vibes/` — vibe theme storage, generation, manager.
  - `src/git/`, `src/shell/`, `src/editor/`, `src/render/`, `src/paths/`,
    `src/shortcuts/`, `src/lifecycle/` — small single-purpose domains.
- `bash-mode/` — managed shell session, transcript store, completion engine.
- `queue/` — file-backed queue/inbox store and types.
- `tests/` — flat `node:test` suite (`tests/*.test.ts`); structural tests read
  the module under test from `src/`, never from `index.ts` source text.
- `scripts/release.mjs` — zero-dep release helper (bump, CHANGELOG, tag).

## Rules

- **No root-level monofiles.** Implementation lives under `src/` organized by
  domain; `index.ts` is only a barrel. Import implementation via
  `src/**` paths (or `bash-mode/`, `queue/`).
- **Module size:** when a file exceeds ~450 lines, split it along domain
  boundaries (e.g. command handlers out of `commands.ts`, git invalidation
  out of `session-lifecycle.ts`). Prefer many cohesive small modules.
- **No circular imports.** Domain modules must not import back into
  `src/extension/core/state.ts` for callbacks; move the callback into a leaf module
  (e.g. `welcome-control.ts`) or wire it through `RuntimeState`.
- **Bun/Node-native TS:** `import` paths carry `.ts` extensions
  (`allowImportingTsExtensions`), `node:`-prefixed builtins, `node --test`
  with type stripping. No build step.
- **English UI:** operator overlays, notify strings, and `/wishcraft` copy are
  English. Do not add Dutch UI strings.
- **Tests:** behavior changes in `src/` need a focused regression test near
  the existing tests for that subsystem; structural tests assert on module
  files in `src/` (never `index.ts`).

## Commands

```bash
npm ci
npm run typecheck      # tsc --noEmit (strict)
npm test               # node --experimental-strip-types --test tests/**/*.test.ts
```

Run both before proposing any non-trivial change.

## Cursor Cloud specific instructions

The Cloud Agent environment is provisioned so the extension can be tested both as
a library and inside real `pi`, with Docker for containerized/parallel runs.

- **Node:** the platform `node` on `PATH` is v22.14 (fine for `npm ci`,
  `typecheck`, and the test suite, which use `--experimental-strip-types`).
  Node 24 is available via `nvm` and is what CI uses.
- **pi CLI:** installed and pinned to the wishcraft peer range
  (`@earendil-works/pi-coding-agent` `>=0.81.0 <0.85.0`). pi requires Node
  `>=22.19`, so the `pi` launcher is wrapped to run under the `nvm` Node 24.
  `~/.pi/agent/settings.json` loads this checkout (`packages: ["/workspace"]`,
  `preset: chef`) so `pi` renders the wishcraft welcome/powerline on startup.
  Running a model needs a provider key (`/login`); the extension loads without
  one.
- **Docker:** `dockerd` runs with the `fuse-overlayfs` storage driver (required
  in the nested VM). `scripts/cloud-agent-start.sh` starts it per boot;
  `scripts/cloud-agent-install.sh` is the idempotent bootstrap (`npm ci` plus
  self-healing pi setup).
- **Containerized / parallel testing:** `scripts/docker-test.sh [-n N]` runs the
  full check suite (`typecheck` + `test` + `circular`) in `node:24` containers,
  each with an isolated copy of the tree, so `N` runs are safe in parallel.
- **Publishing / pi.dev:** merges to `main` auto-publish to npm via the org
  `NPM_TOKEN` (`.github/workflows/release.yml`), and pi.dev mirrors npm. Gate
  the catalog contract with `npm run verify:package`.
