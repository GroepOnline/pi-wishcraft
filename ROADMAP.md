# Roadmap — pi-wishcraft

Baseline: **v1.3.1** (`e79737f`, tag `v1.3.1` 2026-08-25, npm `1.3.1`) — `origin/main` @ `0044a87` (vivid). Historical vNext PR0-8 detail is archived in `CHANGELOG.md` and `docs/design/vnext-overview.md`; this file is the current contract.

## Release line

| Release | Theme | State | Done means | Pin |
| --- | --- | --- | --- | --- |
| **1.2** | Operator Layer | shipped | Deck, Signal 3-lane, 10 bases, gallery/composer, workbench, a11y | tag `v1.2.0` `65e62fd` (784faaa merge) |
| **1.3** | Hardening | shipped | Verify contract, 0 FPS idle, token SSOT, renderer/lifecycle, regression | `f352b38`→`ecb2d5e` v1.3.0, `e79737f` v1.3.1, RC `v1.3.2-cea7e3e` pending |
| **1.4** | Extension Contract | **current** | 1.4a-d below; no new runtime | `0bfa5a2` registry on main, `62d6156` contrib on `feat/contribution-api`, `0044a87` vivid on main |
| **1.5** | Craft Ecosystem | next | skill install via Pi-native dist + recipes, built on 1.4 contract | starts after 1.4c Signal wiring green |
| **2.0** | Stable Platform | target | compat policy, migrations, perf budgets, stable contracts, provenance | after 1.4a-d + 1.3-P1 |

## 1.4 — Extension Contract (current, split)

**1.4a — Settings registry** — *shipped* `0bfa5a2` `feat(config): typed settings registry` on `origin/main`. `src/config/settings-registry.ts` (28 defs, `SETTING_DEFAULTS`, `get/validate` O(1) maps, `SETTING_GROUPS`). `src/extension/settings/wishcraft-config-items.ts` now renders from registry (124 lines removed). Tests `tests/settings-registry.test.ts` + `wishcraft-config.test.ts` green (557). Still TODO: `contributeSettings()` Pi-contribution + `defaults/migrations` + docgen from registry.

**1.4b — Contribution API** — *pending* `62d6156` `feat(contract): typed contribution API` on `origin/feat/contribution-api` (not yet on `origin/main`). `src/extension/contrib/{types,registry}.ts` ships `registerDeckRoute`/`registerSignalSource` (validate `id /^[a-z0-9][a-z0-9-_]*$/`, dedup, `false` never throw). Deck wired via `src/extension/ui/deck/routes.ts` `getAllDeckRouteDefs()`/`isDeckRoute()`. Still TODO: `registerMotion()`, `registerAppearanceContribution()`, `registerRecipeOrAction()` as separate slices (one PR per contract).

**1.4c — Signal wiring** — *next* after 1.4b merge. `src/signal/render.ts` must call `getContributedSignalSources()` with per-source fault isolation (`try/catch` → `null`), versioned capability scope. Done when both Deck and Signal contributions render without taking down the bar (`tests/contrib-registry.test.ts` + `signal.test.ts` + fault test).

**1.4d — Preset composer** — Decouple `PresetDef` `tokens/chrome/signal/motion/deck/welcome/glyphs` from `src/config/structural-presets.ts` to allow `contributedAppearance` overrides per preset with validation. Done when `tests/structural-presets.test.ts` + `tokens.test.ts` cover contributed palette/motion.

**Gate for 1.4 done:** `npm run typecheck && npm test && npx madge --circular src` green, `isDeckRoute` + Signal sources both isolated, registry `contributeSettings` tested, no new runtime.

## 1.3 — Hardening (shipped, pending tags)

P0 Verify: `whitespace + tsc --noEmit + npm test + madge --circular + scripts/verify-pi-package-contract.mjs`. Release depends on Verify and re-checks `origin/main` before tag. `main` requires `Verify` (repo rules). Promote flow is **official**: `release-candidate/v*` + `promote-release-candidate.yml` (`65143ae`) → tag → npm. P1 matrix still open: widths 40/80/120+, ASCII/Nerd/`NO_COLOR`, `full/reduced/functional/off`, Deck hot-path (no fs in paint), legacy colors, gate order, Linux/macOS segments. Pending RCs: `v1.3.2-cea7e3e` (`ff68fff`), `v1.4.0-0bfa5a2` (`529bc10`), `v1.5.0-0044a87` — collapse into single `1.4.0` promote after 1.4c.

## 1.5 — Craft Ecosystem (next)

Starts after 1.4c wiring green: skill install from Pi-native dist (no parallel marketplace), curated recipes. One paragraph; detail deferred.

## 2.0 — Stable Platform (target)

Needs: compat/deprecation policy, migrations with round-trip tests, perf budgets, stable contribution API with fault isolation, provenance via required `Verify`, docs from canonical contracts, no duplicate SSOTs.

## Always-on

English UI, no sync discovery in paint, no background animation when idle (0 FPS, ambient 8 FPS max vivid), no silent Pi core rewrites, policies/hooks disableable, fail closed, Verify before npm, operator-layer boundary.
