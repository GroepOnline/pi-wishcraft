import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { getAgentPath } from "../paths/agent-dirs.ts";

export const SUPPORTED_COST_CURRENCIES = [
  "USD",
  "CNY",
  "EUR",
  "GBP",
  "JPY",
  "CAD",
  "AUD",
  "CHF",
  "INR",
  "KRW",
] as const;

export type CostCurrencyCode = (typeof SUPPORTED_COST_CURRENCIES)[number];

const SYMBOLS: Record<CostCurrencyCode, string> = {
  USD: "$",
  CNY: "¥",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  CAD: "CA$",
  AUD: "A$",
  CHF: "CHF ",
  INR: "₹",
  KRW: "₩",
};

const TTL_MS = 24 * 60 * 60 * 1000;
const ENDPOINT = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json";
const CACHE_FILE = getAgentPath("powerline-footer", "currency-rates.json");

export type CurrencyDisplayMode = "symbol" | "code" | "both";

export function currencySymbol(currency: CostCurrencyCode): string {
  return SYMBOLS[currency];
}

export function normalizeCostCurrency(value: unknown): CostCurrencyCode | undefined {
  if (typeof value !== "string") return undefined;
  const upper = value.trim().toUpperCase();
  return (SUPPORTED_COST_CURRENCIES as readonly string[]).includes(upper)
    ? (upper as CostCurrencyCode)
    : undefined;
}

interface CacheData {
  timestamp: number;
  rates: Partial<Record<CostCurrencyCode, number>>;
}

let activeCache: CacheData | null = null;
let updatePromise: Promise<void> | null = null;

async function loadFromDisk(): Promise<CacheData | null> {
  try {
    const raw = await readFile(CACHE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed && typeof parsed.timestamp === "number" && typeof parsed.rates === "object" && parsed.rates) {
      return parsed as CacheData;
    }
  } catch {
    // Ignore read errors
  }
  return null;
}

async function saveToDisk(data: CacheData): Promise<void> {
  try {
    await mkdir(dirname(CACHE_FILE), { recursive: true });
    await writeFile(CACHE_FILE, JSON.stringify(data));
  } catch {
    // Ignore write errors
  }
}

async function fetchRatesFromNetwork(): Promise<CacheData> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 10000); // 10s timeout
  try {
    const res = await fetch(ENDPOINT, { signal: controller.signal });
    if (!res.ok) throw new Error("Fetch failed");
    const body = await res.json();
    if (!body || typeof body !== "object" || !body.usd) throw new Error("Invalid response format");
    const rates: Partial<Record<CostCurrencyCode, number>> = { USD: 1 };
    for (const code of SUPPORTED_COST_CURRENCIES) {
      if (code === "USD") continue;
      const rate = body.usd[code.toLowerCase()];
      if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) {
        rates[code] = rate;
      }
    }
    return { timestamp: Date.now(), rates };
  } finally {
    clearTimeout(id);
  }
}

function triggerRefresh(now: number): void {
  if (updatePromise) return;
  if (activeCache && now - activeCache.timestamp < TTL_MS) return;

  updatePromise = (async () => {
    if (!activeCache) activeCache = await loadFromDisk();
    if (activeCache && Date.now() - activeCache.timestamp < TTL_MS) return;
    
    try {
      const latest = await fetchRatesFromNetwork();
      activeCache = latest;
      void saveToDisk(latest);
    } catch {
      if (!activeCache) activeCache = await loadFromDisk();
    }
  })().finally(() => {
    updatePromise = null;
  });
}

function getConversionRate(currency: CostCurrencyCode): number | null {
  if (currency === "USD") return 1;
  const r = activeCache?.rates[currency];
  triggerRefresh(Date.now());
  return typeof r === "number" && Number.isFinite(r) && r > 0 ? r : null;
}

export function convertCost(amountUsd: number, currency: CostCurrencyCode): number | null {
  const rate = getConversionRate(currency);
  if (!rate) return null;
  return amountUsd * rate;
}

export function formatDisplayCost(amountUsd: number, currency: CostCurrencyCode = "USD"): string | null {
  const converted = convertCost(amountUsd, currency);
  if (converted === null) return `-- ${currency}`;
  const decimals = (currency === "JPY" || currency === "KRW") ? 0 : 2;
  return `${currencySymbol(currency)}${converted.toFixed(decimals)}`;
}

export function formatUsdCost(amountUsd: number, currency: CostCurrencyCode = "USD"): string | null {
  return formatDisplayCost(amountUsd, currency);
}

export function __setCurrencyRatesForTest(rates: Partial<Record<CostCurrencyCode, number>>, timestamp = Date.now()): void {
  activeCache = { timestamp, rates: { USD: 1, ...rates } };
  updatePromise = null;
}

export function __resetCurrencyRatesForTest(): void {
  activeCache = null;
  updatePromise = null;
}
