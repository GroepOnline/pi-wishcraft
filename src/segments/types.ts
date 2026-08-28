/** Segment pipeline v2 (U2). Pure types — no TUI imports. */

import type { RenderedSegment, SegmentContext } from "../config/types.ts";

export interface PipelineContext {
  /** Bumped by callers when any input that affects rendering changes; the
   *  pipeline uses this together with the segment id as the cache key. */
  version: string;
}

/** A builtin-style segment: typed contract with id + render. */
export interface PipelineSegment {
  id: string;
  render(ctx: SegmentContext): RenderedSegment | Promise<RenderedSegment>;
}

/** A contributed source: free-form id, render returns a raw string. */
export interface PipelineSource {
  id: string;
  render(ctx: SegmentContext): string | undefined | Promise<string | undefined>;
}

export interface RenderedPipelineOutput {
  id: string;
  content: string;
  visible: boolean;
  cached: boolean;
}

export interface PipelineOptions {
  /** Cache rendered results by (id, ctx.version). Default false. */
  cache?: boolean;
  /** Per-segment render budget in ms. Exceeding segments degrade to hidden.
   *  Set to 0 to disable. Default 0 (no budget). */
  budgetMs?: number;
}
