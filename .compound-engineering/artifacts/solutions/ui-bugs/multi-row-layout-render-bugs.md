---
title: Multi-row powerline layout render bugs
date: 2026-08-28
category: ui-bugs
module: wishcraft-render
problem_type: ui_bug
component: frontend_stimulus
symptoms:
  - Large empty block rendered under every status line after adding multi-row segment support
  - Extra-wide dead column between lanes on rows 1+ of multi-row content
  - Multi-row rail sigil renders in default terminal color on lower rows instead of the lane accent color
  - Unknown motion events sometimes render as the literal text "undefined"
  - Motion scheduler can leak a consumer when re-subscribing without an explicit release
root_cause: logic_error
resolution_type: code_fix
severity: medium
tags:
  - terminal
  - render
  - layout
  - multi-row
  - powerline
  - signal
  - scheduler
---

# Multi-row powerline layout render bugs

## Problem

The v2 powerline layout was extended to support multi-row segments so the
signal rail can render a 3-row lantern sigil while the rest of the line stays
on row 0. The refactor passed typecheck and existing tests, but produced
visible artifacts in the terminal: an empty block under every line, a wide
dead column between lanes, color-bleed on the sigil's lower rows, and a silent
scheduler leak. The root cause was a cluster of small logic errors in
`segmentHeight`, `paintLayout`, `renderActivity`, `activityForEvent`,
`defaultMotionFor`, and `MotionScheduler.subscribe`.

## Symptoms

- **Big block under every line.** After the multi-row refactor, every rendered
  status line showed a large empty block below the actual content.
- **Dead column between lanes on extra rows.** The separator between segments
  was rendered as a wide empty column on row 1+ instead of a single space.
- **Color-bleed on multi-row rail.** The 3-row lantern sigil rendered in the
  lane accent color on row 0, but in the terminal default color on rows 1 and 2.
- **"undefined" activity text.** Firing an unhandled motion event could surface
  the literal text `undefined` in the powerline.
- **Silent scheduler leak.** Re-subscribing a motion consumer with the same id
  replaced the old consumer without calling its `onDone` callback.

## What Didn't Work

- **Adding a height hint without filtering empty lines.** The first version of
  `segmentHeight` derived height from `text.split('\n').length`. That worked
  for intentional multi-row segments, but promoted trailing empty lines from
  upstream trims into extra rows. A segment with `"hello\n"` claimed height 2
  and forced `paintLayout` to draw an empty full-width row below it.
- **Using `separator.length` for row-1+ padding.** Styled separators carry ANSI
  escape codes. `separator.length` is the byte length of the escape sequence
  plus the glyph, not the visible terminal width. The row-1+ pad was 9 spaces
  wide for a 1-column separator, painting a dead column between lanes.
- **Relying on outer ANSI wrap for multi-row color.** `renderActivity` wrapped
  the entire 3-line sigil in a single `${railColor}...${reset}` block. Row 0
  got the color; rows 1+ were bleached by the reset at the end of the outer
  wrap.
- **Omitting default cases in switch statements.** Both `activityForEvent` and
  `defaultMotionFor` had no `default` branch. Unknown events returned
  `undefined`, which propagated into the powerline as literal text or broke
  scheduler subscription.

## Solution

### 1. Filter empty lines in `segmentHeight`

**File:** `src/render/layout.ts`

```typescript
function segmentHeight(seg: LayoutSegment): number {
  if (seg.height && seg.height > 1) return seg.height;
  const nonEmpty = seg.text.split("\n").filter((line) => line.length > 0);
  return Math.max(1, nonEmpty.length);
}
```

Trailing empty lines are noise from upstream trims; they must not promote a
segment to extra rows.

### 2. Use `visibleWidth(separator)` for row-1+ padding in `paintLayout`

**File:** `src/render/paint.ts`

```typescript
const sepPad = " ".repeat(visibleWidth(separator));
```

`visibleWidth` strips ANSI codes before measuring, so the pad matches the
column width that row 0 already displayed.

### 3. Wrap each row of the multi-row rail with its own color+reset

**File:** `src/render/motion-rail.ts`

```typescript
const colored = (row: string) => `${railColor}${row}${reset}`;
const rows = allRows.map((row, i) => {
  const prefix = i === 0 ? open : "";
  const suffix = i === allRows.length - 1 ? close : "";
  return `${prefix}${colored(row)}${suffix}`;
});
railBlock = rows.join("\n");
```

Each row carries its own ANSI color and reset, so rows 1+ render in the lane
accent instead of falling back to the terminal default.

### 4. Add `default` cases to event-to-activity and event-to-motion mappings

**Files:** `src/signal/controller.ts`, `src/motion/catalog.ts`

```typescript
export function activityForEvent(event: MotionEvent): string {
  switch (event) {
    // ... known cases ...
    default:
      return "ready";
  }
}

export function defaultMotionFor(event: MotionEvent): string {
  switch (event) {
    // ... known cases ...
    default:
      return "wisp";
  }
}
```

Future events fall back to a safe idle state instead of leaking `undefined`.

### 5. Make `MotionScheduler.subscribe` safe against duplicate ids

**File:** `src/motion/scheduler.ts`

```typescript
subscribe(consumer: MotionConsumer): () => void {
  const existing = this.consumers.get(consumer.id);
  if (existing) {
    existing.onDone?.();
  }
  this.consumers.set(consumer.id, consumer);
  // ...
}
```

Re-subscribing with the same id now calls `onDone` on the old consumer before
replacing it, preventing silent leaks when callers forget to release first.

### 6. Wrap `scheduler.subscribe` in `setSignalEvent` with try/catch

**File:** `src/signal/controller.ts`

```typescript
let release: (() => void) | null = null;
try {
  release = scheduler.subscribe({ /* ... */ });
} catch {
  runtime.active = false;
  runtime.release = null;
  return;
}
runtime.release = release;
```

If subscription throws, the runtime resets to idle instead of being left in a
half-active state (`active=true`, `release=null`).

## Why This Works

The multi-row refactor assumed that every segment's text was a clean single-line
or intentional multi-line string, that separator width was the same in bytes
and terminal cells, and that outer ANSI wrapping survived a `\n` split. None
of those assumptions hold in practice:

- Upstream trims and template engines leave trailing newlines.
- Styled separators are ANSI strings whose byte length differs from visible width.
- Terminals reset styling at `\n` boundaries unless each row re-emits the color.

Fixing each assumption at its source — rather than adding guards in every
caller — prevents the same class of bug from reappearing when other segments
opt into multi-row rendering.

The scheduler fixes address a separate but related contract violation:
`subscribe`/`release` is meant to be a balanced pair, but the implementation
allowed unbalanced re-subscribe without cleanup.

## Prevention

- Add a dedicated multi-row layout test that covers:
  - A 3-row segment mixed with 1-row segments
  - Trailing newlines in segment text
  - Styled separators with ANSI codes
  - Separator padding on rows 1+
- Add a contract test for `MotionScheduler.subscribe` that re-subscribes the
  same id and asserts `onDone` was called exactly once on the previous consumer.
- Use `visibleWidth` for any terminal-column measurement that involves ANSI
  strings; never use `.length` for terminal widths.
- When adding multi-row support to any renderer, audit each row independently
  for color, width, and separator handling — a single outer wrap is not enough.

## Related Issues

- PR #69: v2 platform cutover that introduced the multi-row layout
- PR #74: lantern sigil follow-on that surfaced the render artifacts
