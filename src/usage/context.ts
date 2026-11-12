import {
  estimateTokens,
  sessionEntryToContextMessages,
} from "@earendil-works/pi-coding-agent";

export interface CoreContextUsage {
  /** null when Pi has not measured real context tokens yet (post-compaction gap). */
  contextTokens: number | null;
  contextWindow: number;
  contextPercent: number | null;
}

interface ContextUsageSource {
  sessionManager: {
    getLeafId(): string | null;
  };
  getContextUsage(): unknown;
}

function isContextUsageSource(value: unknown): value is ContextUsageSource {
  return (
    typeof value === "object" &&
    value !== null &&
    "sessionManager" in value &&
    "getContextUsage" in value &&
    typeof (value as any).getContextUsage === "function" &&
    typeof (value as any).sessionManager === "object" &&
    (value as any).sessionManager !== null &&
    "getLeafId" in (value as any).sessionManager &&
    typeof (value as any).sessionManager.getLeafId === "function"
  );
}

export class CoreContextUsageCache {
  private _sessionManager: ContextUsageSource["sessionManager"] | null = null;
  private _leafId: string | null = null;
  private _usage: CoreContextUsage | null = null;

  public get(ctx: unknown): CoreContextUsage | null {
    if (!isContextUsageSource(ctx)) {
      return readCoreContextUsage(ctx);
    }
    const mgr = ctx.sessionManager;
    const leaf = mgr.getLeafId();
    if (this._sessionManager !== mgr || this._leafId !== leaf) {
      this._sessionManager = mgr;
      this._leafId = leaf;
      this._usage = readCoreContextUsage(ctx);
    }
    return this._usage;
  }

  public reset(): void {
    this._sessionManager = null;
    this._leafId = null;
    this._usage = null;
  }
}

export function estimateInitialContextTokens(ctx: unknown): number | null {
  if (typeof ctx !== "object" || ctx === null || !("getSystemPrompt" in ctx)) {
    return null;
  }
  const getter = (ctx as any).getSystemPrompt;
  if (typeof getter !== "function") return null;

  const prompt = getter.call(ctx);
  if (typeof prompt !== "string" || prompt.trim() === "") {
    return null;
  }
  return Math.ceil(prompt.length / 4);
}

export function readCoreContextUsage(ctx: unknown): CoreContextUsage | null {
  if (typeof ctx !== "object" || ctx === null || !("getContextUsage" in ctx)) {
    return null;
  }
  const getter = (ctx as any).getContextUsage;
  if (typeof getter !== "function") return null;

  const usage = getter.call(ctx);
  if (typeof usage !== "object" || usage === null) {
    return null;
  }

  const u = usage as any;
  if (!("tokens" in u) || !(typeof u.tokens === "number" || u.tokens === null)) {
    return null;
  }
  if (!("contextWindow" in u) || typeof u.contextWindow !== "number" || !Number.isFinite(u.contextWindow) || u.contextWindow <= 0) {
    return null;
  }

  const tokens = typeof u.tokens === "number" && Number.isFinite(u.tokens) ? u.tokens : null;
  const pct =
    "percent" in u && typeof u.percent === "number" && Number.isFinite(u.percent)
      ? u.percent
      : tokens !== null
        ? (tokens / u.contextWindow) * 100
        : null;

  return {
    contextTokens: tokens,
    contextWindow: u.contextWindow,
    contextPercent: pct,
  };
}

interface UnknownContextEstimateSource {
  sessionManager?: {
    buildSessionProjection?: () => { messages?: readonly unknown[] };
    buildContextEntries?: () => readonly unknown[];
  };
  getContextUsage?: () => unknown;
  getSystemPrompt?: () => string;
  model?: { contextWindow?: number };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isUnknownContextEstimateSource(
  ctx: unknown,
): ctx is UnknownContextEstimateSource & {
  sessionManager: {
    buildSessionProjection?: () => { messages?: readonly unknown[] };
    buildContextEntries?: () => readonly unknown[];
  };
} {
  if (!isRecord(ctx)) return false;
  const mgr = ctx.sessionManager;
  return (
    isRecord(mgr) &&
    (typeof mgr.buildContextEntries === "function" ||
      typeof mgr.buildSessionProjection === "function")
  );
}

/**
 * Estimate context usage while Pi reports tokens===null — the window right
 * after a compaction, before the next request produces real usage. Builds the
 * active branch's context entries and estimates token counts; the caller
 * snapshots the result at the event boundary so it stays stable per render.
 */
export function estimateUnknownContextUsage(ctx: unknown): CoreContextUsage | null {
  if (!isUnknownContextEstimateSource(ctx)) return null;

  const rawUsage =
    typeof ctx.getContextUsage === "function" ? ctx.getContextUsage() : null;
  if (
    isRecord(rawUsage) &&
    typeof rawUsage.tokens === "number" &&
    Number.isFinite(rawUsage.tokens)
  ) {
    return null; // real tokens already known — no estimate needed
  }

  const contextWindow =
    (isRecord(rawUsage) && typeof rawUsage.contextWindow === "number"
      ? rawUsage.contextWindow
      : ctx.model?.contextWindow) ?? 0;
  if (contextWindow <= 0) return null;

  let tokens = 0;
  let sawSystemMessage = false;
  try {
    const sm = ctx.sessionManager;
    const projected = sm.buildSessionProjection?.().messages;
    const raw =
      projected ?? sm.buildContextEntries?.() ?? [];
    const entries: readonly unknown[] = raw;
    for (const entry of entries) {
      for (const message of sessionEntryToContextMessages(entry as never)) {
        tokens += estimateTokens(message);
        if (message.role === "system") sawSystemMessage = true;
      }
    }
  } catch {
    return null;
  }
  // Compaction entries persist the active system message and
  // sessionEntryToContextMessages yields it back, so getSystemPrompt() is only
  // a fallback for sessions whose entries carry no system message at all —
  // adding it unconditionally would count the same prompt twice.
  if (!sawSystemMessage) {
    const initial = estimateInitialContextTokens(ctx);
    if (initial) tokens += initial;
  }

  return {
    contextTokens: tokens,
    contextWindow,
    contextPercent: (tokens / contextWindow) * 100,
  };
}

/**
 * Display-order resolution: real core tokens win; a null-token core reading
 * is covered by the session-scoped estimate; as a last resort the live
 * assistant usage count fills the bar.
 */
export function resolveDisplayContextUsage(args: {
  coreContextUsage: CoreContextUsage | null;
  unknownCoreFallback: CoreContextUsage | null;
  fallbackContextTokens: number;
  fallbackContextWindow: number;
  /** True when the fallback usage predates the last compaction — stale. */
  fallbackIsPreCompact: boolean;
}): CoreContextUsage | null {
  const core = args.coreContextUsage;
  if (core && core.contextTokens !== null) return core;
  if (core && args.unknownCoreFallback) return args.unknownCoreFallback;
  if (!core && args.unknownCoreFallback) return args.unknownCoreFallback;
  if (
    !args.fallbackIsPreCompact &&
    args.fallbackContextTokens > 0 &&
    args.fallbackContextWindow > 0
  ) {
    return {
      contextTokens: args.fallbackContextTokens,
      contextWindow: args.fallbackContextWindow,
      contextPercent: (args.fallbackContextTokens / args.fallbackContextWindow) * 100,
    };
  }
  return core;
}
