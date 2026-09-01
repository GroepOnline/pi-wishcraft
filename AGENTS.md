# Repository Guidelines

## Project Overview

`pi-wishcraft` is an operator cockpit extension for the **Pi** coding agent (`@earendil-works/pi-coding-agent`). It provides a powerline-style status bar, welcome overlay/header, working "vibes" loading messages, a file-backed idea queue, sticky Bash mode with PTY sessions, inline skill invocation, command-level hooks/policy controls, and a fullscreen Skill Studio. The package ships as a Pi extension rooted at `./index.ts` and is published to npm as `@groeponline/pi-wishcraft`.

## Architecture & Data Flow

### Bootstrap & Runtime Hub

The extension bootstraps from `index.ts`, which re-exports `powerlineFooter` from `src/extension/session/activate.ts`. Activation reads Pi settings, parses powerline config, creates a mutable `RuntimeState` (via `createRuntimeState` in `src/extension/core/state.ts`), and registers Pi lifecycle hooks, commands, segments, presets, shortcuts, skills, and bash-mode sessions.

`src/extension/core/state.ts` is the **central mutable hub** — it holds `config`, schedulers, and derived caches. All runtime mutations flow through `RuntimeState` and callback hooks (`requestStatusRender`, `requestImmediateStatusRender`, `resetLayoutCache`, `dispatchSignalEvent`). Leaf modules consume and extend this hub but never import sibling leaves directly.

### Rendering Pipeline

The render pipeline is a pure, acyclic chain:

1. **SegmentContext** is built read-only by `src/extension/core/segment-context.ts` from `RuntimeState`, config, theme, git state, and usage data.
2. **Segment renderers** are dispatched through `src/segments/registry.ts` — a fault-isolated `renderSegment` that maps segment IDs to pure render functions.
3. **Status line composition** happens in `src/render/v2-entry.ts`, which orders segments, inserts the motion rail from `src/render/motion-rail.ts`, then delegates painting to `src/render/paint.ts` and `src/render/v2-adapter.ts`.

### Motion & Signal

The motion engine (`src/motion/*`) defines a catalog of animations (`src/motion/catalog.ts`), a centralized scheduler (`src/motion/scheduler.ts`), and an accessibility policy (`src/motion/policy.ts`). The Signal controller (`src/signal/controller.ts`) leases one motion consumer per runtime event and manages the lifecycle of rendered signals on the status-line rail.

### Leaf Domains

Each domain operates through `RuntimeState` callbacks:

- **bash-mode/** — PTY-managed shell sessions, transcripts, ghost suggestions, completion engine
- **queue/** — file-backed JSONL queue/inbox store with aliases and retention
- **working-vibes/** — themed loading message generation and persistence
- **welcome/** — fullscreen TUI overlay with branded layout and countdown
- **usage/** — token/cost/context ledger, TPS ring, daily budget
- **theme/** — color resolution, icons, separators, token mapping
- **studio/** — Skill Studio UI component, Deck renderer, advice engine
- **skills/** — skill registry, manager, inline invocation, doctor, status
- **hooks/** — session/context/tool hooks, policy engine, repairs
- **settings/** — settings IO, config commands, appearance write-back

### Acyclic Dependency Rule

Domain modules must not import back into the hub for callbacks. Shared types and constants live in `src/extension/core/`. Verify no circular imports:

```bash
npm run circular
# → madge --circular src index.ts bash-mode queue
```

## Key Directories

| Directory | Purpose |
|---|---|
| `src/` | Extension runtime, organized by domain (core, config, segments, render, signal, motion, theme, welcome, working-vibes, usage, studio, skills, hooks, settings, shortcuts, history, queue, contrib) |
| `src/extension/` | Pi extension runtime: `core/` (hub, types, constants), `session/` (activation, lifecycle), `ui/` (deck, layout), `commands/`, `shortcuts/`, `queue/`, `welcome/`, `skills/`, `hooks/`, `settings/`, `history/`, `contrib/` |
| `src/config/` | Powerline config parsing, presets, settings registry, tokens |
| `src/segments/` | Segment registry and builtin renderers (core, system, usage, custom) |
| `src/theme/` | Colors, icons, separators, token mapping |
| `src/render/` | Paint primitives, v2 adapter, layout, motion-rail |
| `src/motion/` | Motion catalog, scheduler, policy, types, gallery, composer |
| `src/signal/` | Signal controller and event dispatching |
| `src/welcome/` | Welcome overlay, renderer, art, layout |
| `src/studio/` | Studio UI component, deck, advice engine |
| `bash-mode/` | Standalone PTY shell session management (editor, transcript, completion, forward mode) |
| `queue/` | Standalone file-backed queue store and types |
| `tests/` | Flat `node:test` suite (`tests/*.test.ts`), helpers in `tests/helpers/`, fixtures in `tests/fixtures/` |
| `docs/` | Operator guides (configuration, commands, bash-mode, segments, skills, etc.) |
| `docs/design/` | vNext design specs (not operator how-to docs) |
| `.compound-engineering/` | CE overlay: tracked `config.yaml`, artifacts, plans |

## Development Commands

```bash
# Install dependencies
npm ci

# Type check (strict, no emit)
npm run typecheck

# Run all tests
npm test

# Check for circular imports
npm run circular

# Full package contract verification (for publish preparation)
npm run verify:package

# Local preview server (Deck/Signal/motion surfaces)
npm run preview

# Dockerized parallel testing (typecheck + test + circular)
scripts/docker-test.sh [-n N]

# Cloud agent bootstrap (Node 24, pi CLI install)
scripts/cloud-agent-install.sh
scripts/cloud-agent-start.sh
```

### Release Flow

Releases are CI-driven via GitHub Actions:

```bash
# Locally: bump version, rewrite CHANGELOG, tag, optional push
node scripts/release.mjs          # or: npm run release

# Publish to npm (CI handles auth)
scripts/npm-publish.sh

# Create GitHub Release
scripts/github-release.sh
```

CI workflows (`.github/workflows/`):
- `test.yml` — Node 24, typecheck, test, circular, verify:package, npm audit
- `release.yml` — reuses test.yml, prepares release-candidate branch
- `promote-release-candidate.yml` — promotes verified SHA to main, tags, dispatches publish

## Code Conventions & Common Patterns

### Module Structure

- **No root-level monofiles**: implementation lives under `src/` by domain; `index.ts` is a barrel only
- **Module size**: split files exceeding ~450 lines along domain boundaries
- **TypeScript**: `.ts` extensions on all imports (`allowImportingTsExtensions`), `node:`-prefixed builtins, strict mode, no build step
- **Entry point**: `index.ts` re-exports `powerlineFooter` and shortcut helpers — keep it a barrel, no implementation

### Import Paths & Dependency Direction

```typescript
// Correct: import via domain paths
import { SEGMENTS } from "src/segments/registry.ts";
import { createRuntimeState } from "src/extension/core/state.ts";

// Incorrect: avoid importing implementation from index.ts barrel
import { powerlineFooter } from "./index.ts"; // tests must not do this
```

- Tests import from `src/<domain>/*` module files directly, **never** from `index.ts`
- Domain modules must not import back into the hub for callbacks — use `RuntimeState` + callback hooks

### State Management

`RuntimeState` (from `src/extension/core/state.ts`) is the singleton mutable hub. It owns:
- `config` — parsed powerline configuration
- Motion/signal/render schedulers
- Derived caches (segment context, layout)

Leaf consumers receive `RuntimeState` plus callback hooks rather than importing sibling leaves directly.

### Callback Wiring Pattern

```typescript
// Leaf modules receive hooks, do not import siblings
function createRuntimeState(hooks: {
  requestStatusRender: () => void;
  requestImmediateStatusRender: () => void;
  resetLayoutCache: () => void;
}): RuntimeState
```

### Error Handling

- Segment rendering is fault-isolated — a failing segment does not crash the status line
- Policy engine evaluates pre/post tool hooks with deny/inject results
- Hooks runner uses stdin JSON + timeout + process-group kill

### Naming Conventions

- Domain barrels: `src/<domain>/index.ts`
- Segment files: `src/segments/{core,system,usage,custom}.ts`
- Motion modules: `src/motion/{catalog,scheduler,policy,types}.ts`
- Test files: `tests/<subsystem>.test.ts` (flat suite, descriptive names)

## Important Files

### Entry Points
- `index.ts` — package barrel (re-exports `powerlineFooter`, `resolveShortcutConfig`, `parseBashModeSettings`, `PowerlineShortcuts`)
- `src/extension/session/activate.ts` — activation bootstrap
- `src/extension/core/state.ts` — `RuntimeState` hub, `createRuntimeState`
- `src/extension/core/types.ts` — `RuntimeState` type definitions

### Configuration
- `src/config/parse.ts` — `parsePowerlineConfig`, `PowerlineConfig` interface
- `src/config/settings-registry.ts` — operator settings definitions, defaults, validation
- `src/config/structural-presets.ts` — structural preset definitions
- `src/config/tokens.ts` — semantic token mapping

### Rendering
- `src/render/v2-entry.ts` — `renderStatusLineV2` (composed render entry)
- `src/render/v2-adapter.ts` — layout adaptation for painting
- `src/render/paint.ts` — painting primitives
- `src/render/motion-rail.ts` — motion rail surface rendering

### Segments
- `src/segments/registry.ts` — `SEGMENTS` registry, `renderSegment` dispatcher
- `src/segments/core.ts` — model, shell_mode, path, git, time, session, hostname
- `src/segments/system.ts` — thinking, subagents, queue, extension_statuses, open ports/TPS
- `src/segments/usage.ts` — token_in/out/total, cost, context_pct, cache_read/write
- `src/segments/custom.ts` — custom registered/static segments

### Signal & Motion
- `src/signal/controller.ts` — `SignalRuntime` lifecycle
- `src/signal/integration.ts` — event dispatcher
- `src/motion/catalog.ts` — motion definitions, channel matrix
- `src/motion/scheduler.ts` — shared `MotionScheduler`
- `src/motion/policy.ts` — accessibility/policy filter

### Bash Mode
- `bash-mode/pty-session.ts` — PTY session abstraction
- `bash-mode/session-factory.ts` — shell session creation
- `bash-mode/transcript.ts` — `BashTranscriptStore`
- `bash-mode/completion.ts` — completion engine

### Queue
- `queue/store.ts` — `PowerlineQueueStore` (filesystem-backed JSONL)
- `queue/types.ts` — queue item/target/status types

### Studio & Skills
- `src/studio/component.ts` — fullscreen Skill Studio component
- `src/studio/deck/render.ts` — Deck renderer
- `src/studio/advise/engine.ts` — advice pane engine
- `src/extension/skills/skill-registry.ts` — skill catalog
- `src/extension/skills/skill-manager.ts` — skill management commands

### Release & Verification
- `scripts/release.mjs` — version bump, CHANGELOG rewrite, tag
- `scripts/verify-package.mjs` — package contract checks (name, description, keywords, pi manifest, resources, peers)
- `scripts/verify-pi-package-contract.mjs` — Pi package contract validation
- `scripts/npm-publish.sh` — idempotent npm publish with marker-tag promotion
- `scripts/github-release.sh` — GitHub Release creation
- `scripts/gen-lantern.mjs` — generates lantern art pixel-grid module

## Runtime/Tooling Preferences

| Requirement | Detail |
|---|---|
| **Node** | v22.14 system default; Node 24 via nvm for CI and pi CLI (pi requires ≥22.19) |
| **Package manager** | npm (lockfile v3) |
| **TypeScript** | 5.9.3, strict mode, `NodeNext` module/resolution, `allowImportingTsExtensions`, no build step |
| **Test runner** | Node built-in `node:test` with `--experimental-strip-types` type stripping |
| **Circular import check** | `madge --circular src index.ts bash-mode queue` (via `npm run circular`) |
| **Import style** | `.ts` extensions on all imports, `node:`-prefixed builtins |
| **Pi CLI** | Installed at `^0.84.0`; wrapped to run under Node 24 via nvm |
| **Docker** | `fuse-overlayfs` storage driver for nested VM testing |
| **Compound Engineering** | `.compound-engineering/` overlay; portable skills via `~/.agents/skills/ce-*`; native Cursor plugin disabled |

## Testing & QA

### Test Framework

- **Runner**: Node's built-in `node:test` (flat per-file suites)
- **Assertions**: `node:assert/strict`
- **Type stripping**: `--experimental-strip-types` (no `tsc` compilation in tests)
- **Invocation**: `npm test` runs `node --experimental-strip-types --test tests/**/*.test.ts`

### Test Organization

Tests are flat in `tests/` with supporting helpers and fixtures:

- `tests/helpers/strip-ansi.ts` — shared ANSI stripping utility
- `tests/fixtures/skill-template-golden.ts` — golden fixture for skill templates

### Test Types

| Type | Convention | Examples |
|---|---|---|
| **Structural tests** | Assert on module contracts: layout rules, config precedence, catalog/scheduler invariants, registry behavior | `effective-config.test.ts`, `render-v2.test.ts`, `tokens.test.ts`, `hooks.test.ts` |
| **Behavior tests** | Assert runtime output: rendered strings, command execution, state changes, temp FS flows | `signal.test.ts`, `system-segments.test.ts`, `queue-store.test.ts`, `deck.test.ts` |
| **Golden tests** | Pin exact rendered output or template text | `signal-golden.test.ts`, `skill-templates.test.ts` |

### Import Conventions

Tests import from `src/<domain>/*` module files directly — **never** from `index.ts`. For example:

```typescript
// Correct
import { SEGMENTS } from "src/segments/registry.ts";

// Incorrect — do not import from index.ts
import { powerlineFooter } from "./index.ts";
```

### CI Verification Gates

The `.github/workflows/test.yml` workflow enforces the full verification chain:

```bash
npm run typecheck     # tsc --noEmit
npm test              # node --test
npm run circular      # madge --circular
npm run verify:package # verify-package.mjs + verify-pi-package-contract.mjs
npm audit             # security audit
```

### Release Verification

Before any publish, `prepublishOnly` runs the full chain:

```bash
tsc --noEmit && verify-package.mjs && verify-pi-package-contract.mjs
```

### Dockerized Parallel Testing

For isolated, parallel CI runs:

```bash
scripts/docker-test.sh -n 4   # 4 parallel containers
```

Each container runs `typecheck + test + circular` with a shared read-only `node_modules` bind mount.
