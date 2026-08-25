# Roadmap — pi-wishcraft

Baseline: **v1.2.0**, published 2026-08-24.

Pi is the engine. Wishcraft is the operator experience layer: Signal, Deck, skills, ideas, shell UX, hooks, repairs and policy without forking Pi core.

Historical 0.x/1.0/vNext campaign detail belongs in `CHANGELOG.md` and `docs/design/`. This file describes only the current product contract and work that is still open.

## Product boundary

Wishcraft may extend the Pi experience, but it does not become:

- a Pi fork or second agent engine;
- a fleet/orchestration control plane;
- a SaaS integrations bundle;
- a second plugin runtime competing with Pi extensions;
- a telemetry collector by default.

External systems should connect through small contribution/integration contracts. Vendor-specific control planes belong outside Wishcraft.

## Release line

| Release | Theme | State | Done means |
| --- | --- | --- | --- |
| **1.2** | Operator Layer | shipped | Deck, universal Signal, structural appearance, motion gallery/composer, skill workbench and first-class motion accessibility |
| **1.3** | Hardening | current | release invariant, render-path performance, one token source of truth, explicit renderer/lifecycle contracts, regression coverage |
| **1.4** | Extension Contract | next | typed settings registry plus small contribution APIs; no new plugin runtime |
| **1.5** | Craft Ecosystem | later | curated skill/package workflows built on Pi-native distribution and the contribution contract |
| **2.0** | Stable Experience Platform | target | documented compatibility policy, migrations, performance budgets and stable public extension points |

## 1.3 — Hardening

No feature dump. This release exists to make the v1.2 surface trustworthy.

### P0 — release integrity

- One reusable `Verify` contract for PR verification and release gating.
- Verify includes whitespace, typecheck, unit tests, circular dependency check and Pi package contract.
- Release jobs depend on Verify and re-check the synchronized `origin/main` tree before tagging.
- `main` should require the Verify check in repository rules before merge.

### P0 — render/runtime performance

- Deck paint must not run filesystem-backed skill discovery, skill doctor or settings parsing.
- Expensive Deck data is cached as static snapshot state and refreshed only on open, relevant navigation or mutation.
- Live model/Git/context/queue/Signal state remains cheap to repaint.
- Idle motion stays 0 FPS.

### P0 — appearance consistency

- `src/config/types.ts` + `src/config/tokens.ts` are the canonical token contract.
- `src/theme/tokens/*` is compatibility-only; it may re-export but may not define a second palette or semantic mapping.
- One structural base must paint the same semantic roles regardless of the configuration path used to select it.

### P0 — Signal contract

- Signal is the universal status renderer for legacy and structural presets.
- Legacy presets keep their existing segment/layout/color contract unless a structural appearance layer is explicitly selected.
- Terminal one-shots (`success`, `warning`, `error`) settle to `idle/ready` after their finite burst.
- Reduced/off/screen-reader modes communicate state without requiring animation.

### P1 — verification matrix

Add/keep regression coverage for:

- widths around 40 / 80 / 120+ columns;
- ASCII, Nerd Font and `NO_COLOR` rendering;
- full / reduced / functional / off motion;
- Deck render hot-path invariants;
- legacy preset color compatibility;
- release-gate dependency order;
- Linux and macOS system-segment parsing.

## 1.4 — Extension Contract

The next architecture step is **composability**, not more built-in routes.

### Typed settings registry

One registry should drive:

```text
settings definition
      │
      ├─ parsing + validation
      ├─ defaults + migrations
      ├─ /wishcraft settings
      ├─ Pi settings contribution (where supported)
      └─ generated documentation/examples
```

This removes duplicate knowledge about settings and enables a real zero-config first run.

### Small contribution API

Target capabilities, subject to Pi host APIs:

```text
registerDeckRoute()
registerSignalSource()
registerMotion()
registerAppearanceContribution()
registerRecipeOrAction()
contributeSettings()
```

Rules:

- Pi remains the package/extension runtime.
- Contributions are data/callback contracts, not arbitrary nested plugin loaders.
- Public contracts are versioned and capability-scoped.
- A failing contribution cannot take down Signal or the Deck.

## 1.5 — Craft Ecosystem

After the contribution/settings contracts are stable:

- skill import/install workflows from explicit trusted sources;
- curated recipes/actions that compose existing Wishcraft/Pi capabilities;
- package discovery surfaced through Pi-native package distribution rather than a parallel Wishcraft marketplace;
- export/import of appearance and motion recipes with validation.

## 2.0 — Stable Experience Platform

2.0 is justified when the public contracts, not the feature count, are stable.

Required before 2.0:

- compatibility and deprecation policy;
- settings migrations with round-trip tests;
- measured render/performance budgets;
- stable contribution API with fault isolation;
- release provenance and required repository checks;
- docs generated from canonical contracts where practical;
- no known duplicate sources of truth for tokens, settings or release verification.

## Always-on engineering rules

- English operator UI.
- No synchronous discovery work in paint/render loops.
- No background animation when nothing consumes it.
- Core Pi tools are not silently rewritten by Wishcraft repairs.
- Policies and hooks remain explicitly disableable.
- Security-sensitive paths fail closed.
- Package/release verification runs before npm publication.
- New features must fit the operator-layer boundary above.
