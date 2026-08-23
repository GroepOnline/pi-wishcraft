export interface CoreContextUsage {
  contextTokens: number;
  contextWindow: number;
  contextPercent: number;
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
  if (!("tokens" in u) || typeof u.tokens !== "number" || !Number.isFinite(u.tokens)) {
    return null;
  }
  if (!("contextWindow" in u) || typeof u.contextWindow !== "number" || !Number.isFinite(u.contextWindow) || u.contextWindow <= 0) {
    return null;
  }

  const pct = "percent" in u && typeof u.percent === "number" && Number.isFinite(u.percent) 
    ? u.percent 
    : (u.tokens / u.contextWindow) * 100;

  return {
    contextTokens: u.tokens,
    contextWindow: u.contextWindow,
    contextPercent: pct,
  };
}
