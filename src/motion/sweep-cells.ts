/**
 * sweep-cells.ts
 * ---------------------------------------------------------------------------
 * Shared sweep geometry for every travelling-head surface: the status rail,
 * the gallery preview strip and the composer preview all resolve the same
 * head/trail/track cell structure from a fractional head position. Painting
 * (glyphs, color ramps) stays at the call site; the distance math lives here
 * exactly once, so the gallery always previews what the rail paints.
 * ---------------------------------------------------------------------------
 */

/** Where a cell sits relative to the travelling head. */
export type SweepCellKind = "head" | "trail" | "track";

export interface SweepCell {
  index: number;
  kind: SweepCellKind;
  /** Fractional distance behind the head; drives color ramps. */
  distance: number;
  /** Rounded distance; drives distance-keyed glyph pickers. */
  step: number;
}

export interface SweepCellsOptions {
  width: number;
  /** Fractional head position (see `sweepPhase`). */
  pos: number;
  /** True while the head travels rightward; the wake trails to its left. */
  movingRight: boolean;
  /** Wake length in cells; trail cells live at distances 0.5..trailDepth+0.5. */
  trailDepth: number;
}

/**
 * Resolve the cell structure of a sweep: one head cell where the fractional
 * head sits (within half a cell), trail cells with distance behind it on the
 * current leg, track everywhere else.
 */
export function buildSweepCells(options: SweepCellsOptions): SweepCell[] {
  const { width, pos, movingRight, trailDepth } = options;
  const cells: SweepCell[] = [];
  for (let index = 0; index < width; index++) {
    const distance = movingRight ? pos - index : index - pos;
    if (distance > -0.5 && distance <= 0.5) {
      cells.push({ index, kind: "head", distance: 0, step: 0 });
    } else if (distance > 0.5 && distance <= trailDepth + 0.5) {
      cells.push({ index, kind: "trail", distance, step: Math.round(distance) });
    } else {
      cells.push({ index, kind: "track", distance, step: Math.round(distance) });
    }
  }
  return cells;
}
