import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { getAgentDir, getAgentPath } from "../../paths/agent-dirs.ts";

export interface SkillUsage {
  count: number;
  lastUsed: number;
}

const usageCache = new Map<string, SkillUsage>();
let usageLoaded = false;

function usageFile(): string {
  return getAgentPath("skill-usage.json");
}

function loadUsage(): void {
  if (usageLoaded) return;
  usageLoaded = true;
  try {
    const raw = readFileSync(usageFile(), "utf8");
    const parsed = JSON.parse(raw) as Record<string, SkillUsage>;
    for (const [name, u] of Object.entries(parsed)) {
      usageCache.set(name, { count: u.count ?? 0, lastUsed: u.lastUsed ?? 0 });
    }
  } catch {
    // missing file or broken JSON → empty ledger
  }
}

/** Usage for every skill (name → {count, lastUsed}). */
export function getSkillUsage(): Map<string, SkillUsage> {
  loadUsage();
  return usageCache;
}

let usageFlushTimer: ReturnType<typeof setTimeout> | null = null;
let exitFlushRegistered = false;

/** Write the ledger to disk now (best-effort, sync). */
export function flushSkillUsage(): void {
  if (usageFlushTimer) {
    clearTimeout(usageFlushTimer);
    usageFlushTimer = null;
  }
  try {
    const obj: Record<string, SkillUsage> = {};
    for (const [k, v] of usageCache) obj[k] = v;
    mkdirSync(getAgentDir(), { recursive: true });
    writeFileSync(usageFile(), JSON.stringify(obj, null, 2), "utf8");
  } catch {
    // best-effort: tracking must never break the hot path
  }
}

/**
 * Log a skill use. The in-memory ledger updates immediately (so
 * getSkillUsage() is correct), but the disk write is debounced so the
 * input hot path does not do a sync writeFileSync per keystroke.
 */
export function recordSkillUsage(name: string): void {
  loadUsage();
  const cur = usageCache.get(name) ?? { count: 0, lastUsed: 0 };
  usageCache.set(name, { count: cur.count + 1, lastUsed: Date.now() });

  if (!exitFlushRegistered) {
    exitFlushRegistered = true;
    process.once("exit", () => flushSkillUsage());
  }
  if (!usageFlushTimer) {
    usageFlushTimer = setTimeout(() => {
      usageFlushTimer = null;
      flushSkillUsage();
    }, 500);
    usageFlushTimer.unref?.();
  }
}
