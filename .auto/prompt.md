# Autoresearch: Wishcraft Comprehensive — motion, signal, registry, and extension performance

## Objective
Optimize the entire Wishcraft extension for **real effectiveness and speed** — motion must be 100× more visible (vivid sweep, 16/8 FPS, 55-85ms cadence already landed), Signal must render fast with fault isolation, settings registry must resolve in O(1), and the whole extension must typecheck and test quickly. Workload is the real pi-wishcraft extension: `npm run typecheck && npm test && npx madge --circular` plus motion/signal micro-benchmarks.

## Metrics
- **Primary**: `test_duration_ms` (ms, lower is better) — wall time of `npm test` (proxy for overall extension performance; faster tests = faster hot paths, less filesystem work in render loops)
- **Secondary**: `typecheck_ms`, `motion_fps_active`, `motion_fps_ambient`, `signal_render_us`, `registry_lookup_us`, `circular_deps` — tradeoff monitors; log but don't gate keeps

## How to Run
`./.auto/measure.sh` — outputs `METRIC name=value` lines.

## Files in Scope
- `src/motion/*` — scheduler, catalog, policy, frames, gallery (vivid motion landed in 0044a87)
- `src/signal/*` — controller, render, integration (vivid 12-char sweep)
- `src/config/settings-registry.ts`, `src/extension/settings/*`, `src/extension/hooks/*` — registry (0bfa5a2)
- `src/extension/contrib/*` — contribution API (62d6156)
- `src/extension/ui/deck/*` — Deck routes, getAllDeckRouteDefs
- `src/config/tokens.ts`, `src/theme/*`, `src/segments/*` — token contract, rendering
- `src/extension/core/state.ts`, `src/extension/session/*` — state, lifecycle
- `tests/*` — all tests must stay green

## Off Limits
- `main` branch direct push, `package.json` version field (auto-release owns it), secrets, `.env`, `~/.pi`, fleet hosts, UDO plane, `gh auth` switches

## Constraints
- `npm run typecheck` must pass (0 errors)
- `npm test` must pass (all 557+ tests)
- `npx madge --circular src` must report no cycles
- No new dependencies (stdlib/platform first)
- Motion 0 FPS idle guarantee stays (ambient 8 FPS max, not always-on)
- Fault isolation: contributed Deck/Signal must not take down Signal/Deck

## What's Been Tried
- 2026-08-26: Vivid sweep landed (0044a87): 12-char rail with ▓▒░ trail, 16/8 FPS, trails 6-7. Before that motion was single glyph ◜───▓─── + ghost red border.
- 2026-08-26: Settings registry (0bfa5a2) and contribution API (62d6156) landed. Baseline for this session is after those.
- Baseline to measure next.
