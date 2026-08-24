# Automated Regression Testing & TUI Quality Strategy

## Overview

A polished terminal application requires strict regression testing across layout math, animation timelines, token calculations, and ANSI output correctness.

Wishcraft establishes a multi-tiered test strategy that verifies behavior without unstable end-to-end terminal dependencies.

---

## Testing Tiers

```
┌────────────────────────────────────────────────────────┐
│ 1. Pure Unit Tests (Fast, 100% Deterministic)         │
│    - Token color mappings                              │
│    - Preset resolution & overrides                     │
│    - Motion frame calculations                         │
│    - Event router dispatch matrices                    │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│ 2. Layout & String Geometry Tests                      │
│    - Grapheme cluster width calculation                │
│    - Responsive breakpoint truncation                  │
│    - Box-drawing alignment & corner connections        │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│ 3. Snapshot & Golden Master Tests                      │
│    - ANSI escape sequence validation                   │
│    - 10 Preset layout golden snapshots                 │
│    - NO_COLOR and ASCII fallback exports               │
└────────────────────────────────────────────────────────┘
```

---

## Test Automation Invariants

1. **No Headless TUI Requirement**: Core algorithms must never instantiate `ctx.ui` or direct terminal stdout in tests. Renderers emit plain string buffers or token trees.
2. **Deterministic Time Control**: The `MotionScheduler` accepts an injected virtual clock or step function for precise, millisecond-accurate timeline assertions.
3. **Circular Dependency Prevention**: Verified automatically on every build via `npx madge --circular src/`.
4. **Strict TypeScript Checking**: `tsc --noEmit` runs under strict mode with zero implicit `any`.

---

## Golden Test Fixtures

Every signature preset maintains a golden ANSI snapshot for standard viewport dimensions (`120x30`, `80x24`, `50x15`):
- `tests/fixtures/presets/lanternwake-120x30.snap`
- `tests/fixtures/presets/scryglass-80x24.snap`
- `tests/fixtures/presets/hexforge-no-color.snap`
- `tests/fixtures/presets/vellum-ascii-fallback.snap`
