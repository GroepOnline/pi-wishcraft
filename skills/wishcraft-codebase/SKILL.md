---
name: wishcraft-codebase
description: Navigation guide for the pi-wishcraft extension codebase. Use when adding or locating features — status line segments, commands, overlays, hook types, settings, git/usage/theme modules, bash-mode, queue, or tests — or when you need to know where a new piece of functionality belongs.
---

# Wishcraft codebase navigation

pi-coding-agent extension: powerline status line, overlays, skills manager,
hooks. TypeScript run directly with `--experimental-strip-types` (no build).

## Directory clusters

| Cluster | Contents |
| --- | --- |
| `src/config/` | Types, BUILTIN segment ids, powerline config, presets, parsing |
| `src/segments/` | Status line segments + `registry.ts` (SEGMENTS map) |
| `src/extension/session/` | Session lifecycle, cost alerts, git invalidation |
| `src/extension/commands/` | Slash/UI commands (vibe, queue, doctor, export…) |
| `src/extension/hooks/` | Hook types, runner, policy engine/config |
| `src/extension/skills/` | Skill registry, manager UI, templates, inline invocation |
| `src/extension/ui/` | Overlays, menus, widgets, renderers (`overlay-chrome.ts`) |
| `src/extension/settings/` | Settings IO/patching |
| `src/extension/history/` | Prompt history, stash history |
| `src/extension/welcome/` | Welcome/discover screens |
| `src/usage/` | Usage store (mtime-cached reads) |
| `src/git/` | Git status provider (async spawn + serve-stale cache) |
| `src/theme/` | Theme loading/colors |
| `bash-mode/`, `queue/` | Top-level subsystems (own dirs, included in madge scan) |
| `tests/` | node:test suites mirroring the above |

## "Where do I add X?" recipes

**New status line segment**
1. Add the id to `BUILTIN_STATUS_LINE_SEGMENT_IDS` in `src/config/types.ts`.
2. Implement the segment and register it in `SEGMENTS`
   (`src/segments/registry.ts`). Keep it pure/sync — see the hot-path skill.

**New command** — add a module under `src/extension/commands/` and wire it in
`commands.ts`. Follow `vibe-command.ts` / `queue-commands.ts` for shape.

**New overlay** — build it on the shared chrome in
`src/extension/ui/overlay-chrome.ts` (`showSelectOverlay`,
`renderOverlayBox`, `applyOverlayFilter`); see `menu-views.ts` /
`token-overlays.ts` for consumers.

**New hook type** — extend `src/extension/hooks/`: define in
`hooks-config.ts`, execute in `hooks-runner.ts`, gate via
`policy-engine.ts` / `policy-config.ts`.

## Details

Deep maps are maintained separately (other agents own these):

- `docs/semantic/MAP.md` — semantic module map
- `docs/architecture/codebase-graph.md` — dependency graph narrative
  (plus `.dot` / `.mmd` graph sources)

If those files do not exist yet, trust this guide + the source of truth in
`src/`.
