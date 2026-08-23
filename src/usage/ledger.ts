import type { AssistantMessage } from "@earendil-works/pi-ai";

export type SessionAssistantUsage = AssistantMessage["usage"];

export interface SessionTokenStats {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  subagentCost: number;
  lastAssistant: AssistantMessage | undefined;
  thinkingLevelFromSession: string | null;
}

export type LedgerSnapshot = SessionTokenStats;

export function hasSessionAssistantUsage(value: unknown): value is SessionAssistantUsage {
  return (
    typeof value === "object" &&
    value !== null &&
    "input" in value &&
    "output" in value &&
    "cacheRead" in value &&
    "cacheWrite" in value &&
    "cost" in value &&
    typeof (value as any).cost === "object" &&
    "total" in (value as any).cost
  );
}

export function isSessionAssistantMessage(value: unknown): value is AssistantMessage {
  if (typeof value !== "object" || value === null) return false;
  const msg = (value as any);
  return msg.role === "assistant" && hasSessionAssistantUsage(msg.usage);
}

export function getUsageTokenTotal(usage: SessionAssistantUsage): number {
  return usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
}

export function getSessionTotalCost(
  stats: Pick<SessionTokenStats, "cost" | "subagentCost">,
): number {
  return stats.cost + stats.subagentCost;
}

const SUBAGENT_SLASH_RESULT_TYPE = "subagent-slash-result";
function getSubagentCost(entry: any): number {
  if (!entry || typeof entry !== "object") return 0;
  
  let results: unknown[] | undefined;
  if (entry.type === "custom_message" && entry.customType === SUBAGENT_SLASH_RESULT_TYPE) {
    const details = entry.details;
    if (details && typeof details === "object") {
      const result = (details as any).result;
      if (result && typeof result === "object") {
        const inner = (result as any).details;
        if (inner && typeof inner === "object" && Array.isArray((inner as any).results)) {
          results = (inner as any).results;
        }
      }
    }
  } else if (entry.type === "message" && entry.message && typeof entry.message === "object") {
    const m = entry.message as any;
    if (m.role === "toolResult" && m.toolName === "subagent" && m.details && typeof m.details === "object" && Array.isArray(m.details.results)) {
      results = m.details.results;
    }
  }
  
  if (!results) return 0;

  let total = 0;
  for (const r of results) {
    if (r && typeof r === "object" && "usage" in r) {
      const u = (r as any).usage;
      if (u && typeof u === "object" && typeof u.cost === "number") {
        total += u.cost;
      }
    }
  }
  return total;
}

export class TokenLedger {
  private _input = 0;
  private _output = 0;
  private _cacheRead = 0;
  private _cacheWrite = 0;
  private _cost = 0;
  private _subagentCost = 0;
  private _lastAssistant: AssistantMessage | undefined = undefined;
  private _thinkingLevel: string | null = null;
  private _generation = 0;

  public process(event: unknown): void {
    if (typeof event !== "object" || event === null) return;
    const e = event as any;

    let changed = false;

    if (e.type === "thinking_level_change" && typeof e.thinkingLevel === "string") {
      this._thinkingLevel = e.thinkingLevel;
      changed = true;
    }

    const subCost = getSubagentCost(e);
    if (subCost > 0) {
      this._subagentCost += subCost;
      changed = true;
    }

    if (e.type === "message" && isSessionAssistantMessage(e.message)) {
      const m = e.message;
      if (m.stopReason !== "error" && m.stopReason !== "aborted") {
        this._input += m.usage.input;
        this._output += m.usage.output;
        this._cacheRead += m.usage.cacheRead;
        this._cacheWrite += m.usage.cacheWrite;
        this._cost += m.usage.cost.total;
        if (getUsageTokenTotal(m.usage) > 0) {
          this._lastAssistant = m;
        }
        changed = true;
      }
    }

    if (changed) {
      this._generation++;
    }
  }

  public get generation(): number {
    return this._generation;
  }

  public clone(): TokenLedger {
    const copy = new TokenLedger();
    copy._input = this._input;
    copy._output = this._output;
    copy._cacheRead = this._cacheRead;
    copy._cacheWrite = this._cacheWrite;
    copy._cost = this._cost;
    copy._subagentCost = this._subagentCost;
    copy._lastAssistant = this._lastAssistant;
    copy._thinkingLevel = this._thinkingLevel;
    copy._generation = this._generation;
    return copy;
  }

  public snapshot(): LedgerSnapshot {
    return {
      input: this._input,
      output: this._output,
      cacheRead: this._cacheRead,
      cacheWrite: this._cacheWrite,
      cost: this._cost,
      subagentCost: this._subagentCost,
      lastAssistant: this._lastAssistant,
      thinkingLevelFromSession: this._thinkingLevel,
    };
  }
}

export interface SessionBranchProvider {
  getLeafId(): string | null;
  getBranch(): readonly unknown[];
}

function isSessionBranchProvider(value: unknown): value is SessionBranchProvider {
  return (
    typeof value === "object" &&
    value !== null &&
    "getLeafId" in value &&
    "getBranch" in value &&
    typeof (value as any).getLeafId === "function" &&
    typeof (value as any).getBranch === "function"
  );
}

export class SessionBranchCache {
  private _provider: SessionBranchProvider | null = null;
  private _leafId: string | null = null;
  private _branch: readonly unknown[] = [];

  get(source: unknown): readonly unknown[] {
    if (!isSessionBranchProvider(source)) return [];
    const leafId = source.getLeafId();
    if (this._provider !== source || this._leafId !== leafId) {
      this._provider = source;
      this._leafId = leafId;
      this._branch = source.getBranch();
    }
    return this._branch;
  }

  reset(): void {
    this._provider = null;
    this._leafId = null;
    this._branch = [];
  }
}

export function computeSessionTokenStats(sessionEvents: readonly unknown[]): SessionTokenStats {
  const ledger = new TokenLedger();
  for (const event of sessionEvents) {
    ledger.process(event);
  }
  return ledger.snapshot();
}

function computeEventSignature(event: unknown): string {
  if (typeof event !== "object" || event === null) return "nil";
  const e = event as any;
  if (e.type === "thinking_level_change") return `t:${e.thinkingLevel}`;
  const subCost = getSubagentCost(e);
  if (subCost > 0) return `s:${e.details?.results?.length}:${subCost}`;
  if (e.type === "message" && e.message && e.message.role === "assistant") {
    const m = e.message;
    if (hasSessionAssistantUsage(m.usage)) {
      return `a:${m.stopReason}:${m.usage.input}:${m.usage.output}:${m.usage.cacheRead}:${m.usage.cacheWrite}:${m.usage.cost.total}`;
    }
    return `m:${m.role}:${m.stopReason}`;
  }
  return `e:${e.type}`;
}

export class SessionTokenStatsCache {
  private _processedCount = -1;
  private _tailSignature = "";
  private _tailEvent: unknown = undefined;
  
  private _prefixLedger = new TokenLedger();
  private _lastSnapshot: LedgerSnapshot | null = null;

  get(events: readonly unknown[]): SessionTokenStats {
    const totalCount = events.length;
    const currentTail = totalCount > 0 ? events[totalCount - 1] : undefined;
    const currentTailSignature = computeEventSignature(currentTail);

    if (
      this._lastSnapshot &&
      this._processedCount === totalCount &&
      this._tailEvent === currentTail &&
      this._tailSignature === currentTailSignature
    ) {
      return this._lastSnapshot;
    }

    const canExtend = this._lastSnapshot !== null && 
      totalCount > this._processedCount && 
      (this._processedCount === 0 || (
        events[this._processedCount - 1] === this._tailEvent && 
        computeEventSignature(events[this._processedCount - 1]) === this._tailSignature
      ));

    let activeLedger: TokenLedger;

    if (canExtend && this._lastSnapshot !== null) {
      // Add the OLD tail to the prefix ledger, as well as any intermediate events
      for (let i = Math.max(0, this._processedCount - 1); i < totalCount - 1; i++) {
        this._prefixLedger.process(events[i]);
      }
      activeLedger = this._prefixLedger.clone();
    } else if (
      this._lastSnapshot !== null &&
      this._processedCount === totalCount &&
      this._tailEvent === currentTail
    ) {
      // In-place mutation of the tail event. The prefix is valid.
      activeLedger = this._prefixLedger.clone();
    } else {
      this._prefixLedger = new TokenLedger();
      for (let i = 0; i < totalCount - 1; i++) {
        this._prefixLedger.process(events[i]);
      }
      activeLedger = this._prefixLedger.clone();
    }

    if (totalCount > 0) {
      activeLedger.process(currentTail);
    }

    this._processedCount = totalCount;
    this._tailEvent = currentTail;
    this._tailSignature = currentTailSignature;
    this._lastSnapshot = activeLedger.snapshot();

    return this._lastSnapshot;
  }

  reset(): void {
    this._processedCount = -1;
    this._tailEvent = undefined;
    this._tailSignature = "";
    this._prefixLedger = new TokenLedger();
    this._lastSnapshot = null;
  }
}
