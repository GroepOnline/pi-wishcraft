/**
 * Segment pipeline v2 (U2, KTD5).
 *
 * Routes builtin segments and contributed signal sources through the same
 * try/catch + cache + render-budget path. v1's `renderSegment` /
 * `renderContributedSources` still work; U11 cuts them over to call this
 * pipeline instead.
 */

import type { RenderedSegment, SegmentContext } from "../config/types.ts";
import type {
  PipelineContext,
  PipelineOptions,
  PipelineSegment,
  PipelineSource,
  RenderedPipelineOutput,
} from "./types.ts";

interface CacheEntry {
  key: string;
  value: RenderedPipelineOutput;
}

const cacheStore = new Map<string, CacheEntry>();

function cacheKey(id: string, version: string): string {
  return `${id}:${version}`;
}

function normalizeSourceOutput(raw: string | undefined): RenderedSegment {
  if (raw === undefined) return { content: "", visible: false };
  const trimmed = raw.trim();
  if (!trimmed) return { content: "", visible: false };
  return { content: raw, visible: true };
}

async function renderBuiltin(
  segment: PipelineSegment,
  ctx: SegmentContext,
  budgetMs: number,
): Promise<RenderedSegment | null> {
  if (budgetMs > 0) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => segment.render(ctx))(),
        new Promise<RenderedSegment>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error("render-budget-exceeded")),
            budgetMs,
          );
        }),
      ]);
    } catch (err) {
      if (err instanceof Error && err.message === "render-budget-exceeded") {
        return { content: "", visible: false };
      }
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  try {
    return await (async () => segment.render(ctx))();
  } catch {
    return null;
  }
}

async function renderSource(
  source: PipelineSource,
  ctx: SegmentContext,
  budgetMs: number,
): Promise<RenderedSegment | null> {
  if (budgetMs > 0) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const raw = await Promise.race([
        (async () => source.render(ctx))(),
        new Promise<string | undefined>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error("render-budget-exceeded")),
            budgetMs,
          );
        }),
      ]);
      return normalizeSourceOutput(raw);
    } catch {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  let raw: string | undefined;
  try {
    raw = await (async () => source.render(ctx))();
  } catch {
    return null;
  }
  return normalizeSourceOutput(raw);
}

export async function runSegmentPipeline(
  segments: readonly PipelineSegment[],
  sources: readonly PipelineSource[],
  ctx: PipelineContext,
  options: PipelineOptions = {},
): Promise<RenderedPipelineOutput[]> {
  const { cache = false, budgetMs = 0 } = options;
  const segCtx: SegmentContext = ctx as unknown as SegmentContext;
  const out: RenderedPipelineOutput[] = [];

  for (const segment of segments) {
    const key = cacheKey(segment.id, ctx.version);
    if (cache) {
      const hit = cacheStore.get(key);
      if (hit) {
        out.push({ ...hit.value, cached: true });
        continue;
      }
    }
    const rendered = await renderBuiltin(segment, segCtx, budgetMs);
    if (rendered === null) continue;
    const entry: RenderedPipelineOutput = {
      id: segment.id,
      content: rendered.content,
      visible: rendered.visible,
      cached: false,
    };
    out.push(entry);
    if (cache) cacheStore.set(key, { key, value: entry });
  }

  for (const source of sources) {
    const key = cacheKey(source.id, ctx.version);
    if (cache) {
      const hit = cacheStore.get(key);
      if (hit) {
        out.push({ ...hit.value, cached: true });
        continue;
      }
    }
    const rendered = await renderSource(source, segCtx, budgetMs);
    if (rendered === null || !rendered.visible) continue;
    const entry: RenderedPipelineOutput = {
      id: source.id,
      content: rendered.content,
      visible: rendered.visible,
      cached: false,
    };
    out.push(entry);
    if (cache) cacheStore.set(key, { key, value: entry });
  }

  return out;
}

export function clearSegmentCache(): void {
  cacheStore.clear();
}
