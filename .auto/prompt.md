# Autoresearch: extreme TUI motion (beyond the bar)

## Objective
Joep: "kan toch wel meer en creatiever, niet per een staaf" — the comet rail
(fixed ● head + ━╾╌ trail) is correct but conservative. Explore tick-driven
12-char rail motions that read as *informatie* rather than decoration, then
wire the winner(s) into `renderActivity` (motion-rail) behind the structural
preset.

## Metrics
- **Primary**: `violations` (count, lower is better) — constraint hits per
  candidate across 24 ticks (see measure.sh): wrong width, shade blocks
  (░▒▓█), multi-family mixing, missing ASCII fallback, idle-not-flat.
- **Secondary**: `render_us` — per-frame render microseconds (motion runs at
  ~10 Hz; budget is generous but must not regress).
- **Taste gate**: human-readable snapshot per candidate; kept = reads clean,
  directional, calm at idle. Ugly = discard regardless of metrics.

## How to Run
`./.auto/measure.sh` — renders every candidate in
`src/render/motion-candidates.ts` over 24 ticks, emits
`METRIC violations=N` + `METRIC render_us=N` + `METRIC candidates=N`,
writes frame snapshots to `.auto/frames-<name>.txt`.

## Files in Scope
- `src/render/motion-candidates.ts` — candidate renderers (the lab).
- `src/render/motion-rail.ts` — production rail; winner gets wired here.
- `src/config/structural-presets.ts` — preset opting into the new geometry.
- `.auto/measure.sh`, `.auto/log.jsonl` — harness + results.

## Off Limits
- `src/motion/frames.ts` shared ramps (already converged).
- No new deps; no timers/async — tick-driven pure renders only.

## Constraints
- One glyph family per frame; NO shade blocks (░▒▓█).
- Width exactly 12 cols, ASCII fallback required, idle = flat calm rail.
- `npm run typecheck` + `npm test` green before keep.

## What's Been Tried
- Baseline (kept, on feat branch): directional comet ●+━╾╌.
- heat/liquid gallery frames → density pulse ─╌╾━╾╌ (kept, 14a0457).
