# Signal — Animated status contract

## Overview

Signal is Wishcraft's status renderer for stock Pi. `/signal` is primary; `/powerline` remains a compatibility alias. No-args toggles the surface, `/signal menu` opens Navigate / Configure / Status, and `/signal <preset>` changes the information preset.

Signal divides status into three lanes:

```text
LEFT / IDENTITY            CENTER / ACTIVITY            RIGHT / CONTEXT
model · git · workspace    lifecycle · tool · motion    context · queue
```

A typical frame:

```text
◆ GPT-5.6  main       ╾✦╼ read_file       ctx █████░ 47% · q1
```

## Renderer contract

**Signal is the universal status-line renderer.** This is intentional, including for the legacy layout preset names (`default`, `minimal`, `compact`, `full`, `nerd`, `ascii`, `chef`). There is no second legacy renderer hidden behind those names.

Compatibility is preserved at the data/config layer:

- legacy presets still define their existing segment selection, layout options, separators, and explicit colors;
- with no structural appearance layer selected, legacy preset colors remain exact;
- structural preset names (`lanternwake` … `crucible`) opt into the vNext appearance personality and semantic-token palette;
- `powerline.appearance.*` may mix palette, Signal grammar, chrome, glyphs, deck, welcome, and motion independently.

In other words: **one renderer, two compatible preset contracts**. A future change that restores a second renderer or silently remaps legacy colors is a breaking change and requires explicit migration tests.

## Three lanes

1. **Identity / workspace** — model, Git state, path/workspace identity.
2. **Activity** — thinking, streaming, tool execution, compacting and one-shot outcomes.
3. **Context / queue** — context usage and queued/parked work.

Width pressure is resolved inside Signal; lanes may compact or omit optional detail, but their semantic order stays identity → activity → context.

## Motion lifecycle

Signal owns no timer. It leases the shared MotionScheduler only while a motion channel needs frames.

```text
idle / ready       0 FPS
      │
      ├─ thinking / streaming / tool.start / compact  → active state
      │
      └─ success | warning | error                    → finite burst
                                                        ↓
                                                     idle / ready
                                                     0 FPS
```

Terminal one-shots (`success`, `warning`, `error`) settle their semantic state back to `idle/ready` when the final frame completes. This prevents a completed agent run from leaving `done` painted indefinitely without keeping a background timer alive.

Reduced/functional/off motion policies may suppress frames entirely; status text must still communicate the state. `NO_COLOR`, screen-reader flags and ASCII fallback are first-class inputs to the same policy.

## Fault isolation

Signal builds on Wishcraft's segment isolation:

- a failing custom segment is isolated instead of blanking the full status surface;
- cached Git/session state is preferred during transient refreshes;
- separators collapse around hidden/empty segments;
- rendering must not perform unrelated discovery work such as the Deck skill doctor.

## Performance invariant

Idle is 0 FPS. Continuous animation uses the shared coalescing scheduler. Expensive filesystem-backed discovery belongs outside paint/render paths; status rendering consumes already-resolved/cached state.
