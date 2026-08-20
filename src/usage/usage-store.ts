/**
 * Append-only daily usage ledger at ~/.pi/agent/wishcraft-usage.json.
 * Compacts old events into per-day rolled totals past a length threshold.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { getAgentPath } from "../paths/agent-dirs.ts";

export interface UsageTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
}

export interface UsageEvent extends UsageTotals {
  at: number;
  model?: string;
}

export interface UsageFile {
  rolled: Record<string, UsageTotals>;
  events: UsageEvent[];
}

export interface UsagePeriodSummary extends UsageTotals {
  cacheHitPct: number;
}

export interface UsageOverlaySummary {
  session: UsagePeriodSummary;
  today: UsagePeriodSummary;
  week: UsagePeriodSummary;
  byModel: Array<{ model: string; tokens: number; cost: number }>;
  sparkline: string;
  dailyLimit: number | null;
  dailyUsed: number;
  budgetRatio: number | null;
}

const EMPTY_TOTALS: UsageTotals = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  cost: 0,
};

export const USAGE_COMPACT_EVENT_LIMIT = 300;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function usageFilePath(): string {
  return getAgentPath("wishcraft-usage.json");
}

export function emptyUsageFile(): UsageFile {
  return { rolled: {}, events: [] };
}

export function parseUsageFile(raw: unknown): UsageFile {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return emptyUsageFile();
  }
  const rec = raw as Record<string, unknown>;
  const rolled: Record<string, UsageTotals> = {};
  if (rec.rolled && typeof rec.rolled === "object" && !Array.isArray(rec.rolled)) {
    for (const [day, value] of Object.entries(rec.rolled as Record<string, unknown>)) {
      const totals = coerceTotals(value);
      if (totals) rolled[day] = totals;
    }
  }
  const events: UsageEvent[] = [];
  if (Array.isArray(rec.events)) {
    for (const item of rec.events) {
      const event = coerceEvent(item);
      if (event) events.push(event);
    }
  }
  return { rolled, events };
}

function coerceTotals(value: unknown): UsageTotals | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rec = value as Record<string, unknown>;
  const num = (key: string): number =>
    typeof rec[key] === "number" && Number.isFinite(rec[key]) ? (rec[key] as number) : 0;
  return {
    input: num("input"),
    output: num("output"),
    cacheRead: num("cacheRead"),
    cacheWrite: num("cacheWrite"),
    cost: num("cost"),
  };
}

function coerceEvent(value: unknown): UsageEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rec = value as Record<string, unknown>;
  const totals = coerceTotals(value);
  if (!totals || typeof rec.at !== "number" || !Number.isFinite(rec.at)) return null;
  const model = typeof rec.model === "string" && rec.model.trim() ? rec.model.trim() : undefined;
  return { ...totals, at: rec.at, model };
}

export function addTotals(a: UsageTotals, b: UsageTotals): UsageTotals {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    cost: a.cost + b.cost,
  };
}

export function dayKey(at: number, timeZone?: string): string {
  const d = new Date(at);
  if (timeZone) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function tokenTotal(totals: UsageTotals): number {
  return totals.input + totals.output + totals.cacheRead + totals.cacheWrite;
}

export function cacheHitPct(totals: UsageTotals): number {
  const denom = totals.input + totals.cacheRead;
  if (denom <= 0) return 0;
  return (totals.cacheRead / denom) * 100;
}

export function compactUsageFile(
  file: UsageFile,
  now: number,
  limit = USAGE_COMPACT_EVENT_LIMIT,
): UsageFile {
  if (file.events.length <= limit) return file;
  const cutoff = now - WEEK_MS;
  const rolled = { ...file.rolled };
  let kept: UsageEvent[] = [];
  for (const event of file.events) {
    if (event.at < cutoff) {
      const key = dayKey(event.at);
      rolled[key] = addTotals(rolled[key] ?? EMPTY_TOTALS, event);
    } else {
      kept.push(event);
    }
  }
  kept.sort((a, b) => a.at - b.at);
  while (kept.length > limit) {
    const event = kept.shift();
    if (!event) break;
    const key = dayKey(event.at);
    rolled[key] = addTotals(rolled[key] ?? EMPTY_TOTALS, event);
  }
  return { rolled, events: kept };
}

export function totalsForRange(
  file: UsageFile,
  startMs: number,
  endMs: number,
): UsageTotals {
  let totals = { ...EMPTY_TOTALS };
  for (const [key, value] of Object.entries(file.rolled)) {
    const dayStart = Date.parse(`${key}T00:00:00`);
    if (!Number.isFinite(dayStart)) continue;
    if (dayStart >= startMs && dayStart < endMs) {
      totals = addTotals(totals, value);
    }
  }
  for (const event of file.events) {
    if (event.at >= startMs && event.at < endMs) {
      totals = addTotals(totals, event);
    }
  }
  return totals;
}

export function modelBreakdown(
  file: UsageFile,
  startMs: number,
  endMs: number,
): Array<{ model: string; tokens: number; cost: number }> {
  const map = new Map<string, UsageTotals>();
  for (const event of file.events) {
    if (event.at < startMs || event.at >= endMs) continue;
    const name = event.model ?? "(unknown)";
    map.set(name, addTotals(map.get(name) ?? EMPTY_TOTALS, event));
  }
  return [...map.entries()]
    .map(([model, totals]) => ({
      model,
      tokens: tokenTotal(totals),
      cost: totals.cost,
    }))
    .sort((a, b) => b.tokens - a.tokens);
}

export function usageSparkline(values: readonly number[], width = 14): string {
  if (values.length === 0) return "·".repeat(width);
  const blocks = "▁▂▃▄▅▆▇█";
  const max = Math.max(...values, 1);
  const step = Math.max(1, Math.ceil(values.length / width));
  let out = "";
  for (let i = 0; i < values.length && out.length < width; i += step) {
    const slice = values.slice(i, i + step);
    const v = slice.reduce((a, b) => a + b, 0) / slice.length;
    const idx = Math.min(blocks.length - 1, Math.floor((v / max) * (blocks.length - 1)));
    out += blocks[idx];
  }
  return out.padEnd(width, "·");
}

function periodSummary(totals: UsageTotals): UsagePeriodSummary {
  return { ...totals, cacheHitPct: cacheHitPct(totals) };
}

export function summarizeUsageOverlay(options: {
  file: UsageFile;
  session: UsageTotals;
  now?: number;
  dailyLimit?: number | null;
}): UsageOverlaySummary {
  const now = options.now ?? Date.now();
  const todayKey = dayKey(now);
  const todayStart = Date.parse(`${todayKey}T00:00:00`);
  const weekStart = now - WEEK_MS;
  const today = totalsForRange(options.file, todayStart, now + 1);
  const week = totalsForRange(options.file, weekStart, now + 1);
  const dailyLimit =
    typeof options.dailyLimit === "number" &&
    Number.isFinite(options.dailyLimit) &&
    options.dailyLimit > 0
      ? options.dailyLimit
      : null;
  const dailyUsed = tokenTotal(today);
  const sparkValues = lastNDayTotals(options.file, now, 14).map(tokenTotal);
  return {
    session: periodSummary(options.session),
    today: periodSummary(today),
    week: periodSummary(week),
    byModel: modelBreakdown(options.file, weekStart, now + 1).slice(0, 6),
    sparkline: usageSparkline(sparkValues),
    dailyLimit,
    dailyUsed,
    budgetRatio: dailyLimit ? dailyUsed / dailyLimit : null,
  };
}

function lastNDayTotals(file: UsageFile, now: number, days: number): UsageTotals[] {
  const out: UsageTotals[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const at = now - i * 24 * 60 * 60 * 1000;
    const key = dayKey(at);
    const start = Date.parse(`${key}T00:00:00`);
    const end = start + 24 * 60 * 60 * 1000;
    out.push(totalsForRange(file, start, end));
  }
  return out;
}

function formatTokens(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1000000) return `${Math.round(n / 1000)}k`;
  if (n < 10000000) return `${(n / 1000000).toFixed(1)}M`;
  return `${Math.round(n / 1000000)}M`;
}

export function formatUsageOverlayLines(summary: UsageOverlaySummary): string[] {
  const line = (label: string, totals: UsagePeriodSummary) =>
    `${label}  ${formatTokens(tokenTotal(totals))}  in ${formatTokens(totals.input)}  out ${formatTokens(totals.output)}  cache ${totals.cacheHitPct.toFixed(0)}%  $${totals.cost.toFixed(2)}`;
  const lines = [
    line("session", summary.session),
    line("today  ", summary.today),
    line("week   ", summary.week),
    `spark   ${summary.sparkline}`,
  ];
  if (summary.dailyLimit) {
    const pct = Math.round((summary.budgetRatio ?? 0) * 100);
    lines.push(
      `budget  ${formatTokens(summary.dailyUsed)}/${formatTokens(summary.dailyLimit)} (${pct}%)`,
    );
  }
  for (const row of summary.byModel) {
    lines.push(`model   ${row.model}  ${formatTokens(row.tokens)}  $${row.cost.toFixed(2)}`);
  }
  return lines;
}

let cachedRead: { path: string; mtime: number; file: UsageFile } | null = null;

export function loadUsageFileFromDisk(path = usageFilePath()): UsageFile {
  try {
    if (!existsSync(path)) return emptyUsageFile();
    const mtime = statSync(path).mtimeMs;
    if (cachedRead && cachedRead.path === path && cachedRead.mtime === mtime) {
      return cachedRead.file;
    }
    const file = parseUsageFile(JSON.parse(readFileSync(path, "utf8")));
    cachedRead = { path, mtime, file };
    return file;
  } catch {
    cachedRead = null;
    return emptyUsageFile();
  }
}

export function saveUsageFileToDisk(file: UsageFile, path = usageFilePath()): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(file)}\n`, "utf8");
  try {
    cachedRead = { path, mtime: statSync(path).mtimeMs, file };
  } catch {
    cachedRead = null;
  }
}

export function recordUsageEvent(
  event: UsageEvent,
  options: { path?: string; now?: number } = {},
): UsageFile {
  const path = options.path ?? usageFilePath();
  const now = options.now ?? Date.now();
  const loaded = loadUsageFileFromDisk(path);
  loaded.events.push(event);
  const compacted = compactUsageFile(loaded, now);
  saveUsageFileToDisk(compacted, path);
  return compacted;
}

/** Test helper: record against an in-memory file without touching disk. */
export function appendUsageEvent(
  file: UsageFile,
  event: UsageEvent,
  now = event.at,
): UsageFile {
  return compactUsageFile({ ...file, events: [...file.events, event] }, now);
}
