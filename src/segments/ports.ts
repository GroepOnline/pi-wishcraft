/**
 * ports.ts
 * ---------------------------------------------------------------------------
 * One source of truth for "which ports are listening".
 *
 * Previously three call sites each did their own thing: the segment counted
 * with a hand-rolled token scan, the segment detail parsed `ss -tulnp`
 * separately, and the `alt+i` list ran its **own `execSync` with no timeout**
 * and dumped raw `ss` lines on screen. One parse, one probe, one renderer.
 *
 * The pure parsing/rendering half lives in `ports-parse.ts`, the `/proc/net`
 * fallback in `ports-proc.ts`. This module owns the parts with side effects:
 * the probe ladder, the TTL cache, and the notification that tells the status
 * line a background probe landed.
 *
 * The rule the whole package follows: **nothing here spawns a process from a
 * render path.** Callers either await `requestPorts()` (overlays) or call
 * `readPorts()` (segments), which serves the last known value and schedules a
 * background refresh.
 * ---------------------------------------------------------------------------
 */

import { exec } from "node:child_process";

import { sshCommand } from "./probe-shell.ts";
import { readProcListeningPorts } from "./ports-proc.ts";
import {
  parseListeningPorts,
  summarizePorts,
  type ListeningPort,
} from "./ports-parse.ts";

export * from "./ports-parse.ts";

// ---------------------------------------------------------------------------
// Probe
// ---------------------------------------------------------------------------

export interface PortsProbeOptions {
  includeUdp?: boolean;
  host?: string;
  /** Override the process timeout; the default matches the segment probe. */
  timeoutMs?: number;
}

export interface PortsProbeResult {
  rows: ListeningPort[];
  /** Human-readable failure reason, or `null` on success. */
  error: string | null;
  host: string | null;
  /** Command chain that produced the output, for diagnostics. */
  source: "ss" | "netstat" | "proc" | "failed";
}

function runShell(command: string, timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    exec(command, { timeout: timeoutMs, encoding: "utf8", maxBuffer: 1 << 20 }, (error, stdout) => {
      if (error || typeof stdout !== "string") return resolve(null);
      resolve(stdout);
    });
  });
}

/**
 * Probe listening sockets without blocking the event loop.
 *
 * Asynchronous on purpose: `showOpenPortsList` used `execSync` with no
 * timeout, so a wedged `ss` (or an SSH host that never answers) froze the
 * whole TUI. Every attempt is bounded by `timeoutMs`.
 *
 * Results are memoised for `PORTS_CACHE_TTL_MS` so the status rail, the `alt+i`
 * panel and the Deck route can all read the same probe instead of each
 * spawning `ss`.
 */
export const PORTS_CACHE_TTL_MS = 5000;

let portsCache: { key: string; at: number; result: PortsProbeResult } | null = null;
let portsInFlight: { key: string; promise: Promise<PortsProbeResult> } | null = null;

const portsListeners = new Set<() => void>();

/**
 * Subscribe to probe completions. The status rail uses this to re-render once
 * a background probe lands — the same serve-stale pattern `git/status.ts` uses,
 * and the reason a segment can read ports synchronously without spawning.
 */
export function subscribePortsUpdates(listener: () => void): () => void {
  portsListeners.add(listener);
  return () => portsListeners.delete(listener);
}

function notifyPortsUpdate(): void {
  for (const listener of portsListeners) listener();
}

function cacheKey(options: PortsProbeOptions): string {
  return `${options.includeUdp ? "u" : "t"}:${options.host ?? ""}:${options.timeoutMs ?? 3000}`;
}

/** Synchronous peek at the last probe; `null` when there is none (yet). */
export function peekPorts(options: PortsProbeOptions = {}): PortsProbeResult | null {
  const key = cacheKey(options);
  if (!portsCache || portsCache.key !== key) return null;
  if (Date.now() - portsCache.at > PORTS_CACHE_TTL_MS) return null;
  return portsCache.result;
}

/** Drop the memo (tests, and after a config change). */
export function invalidatePortsCache(): void {
  portsCache = null;
}

function failedResult(options: PortsProbeOptions, error: string): PortsProbeResult {
  const result: PortsProbeResult = {
    rows: [],
    error,
    host: options.host ?? null,
    source: "failed",
  };
  portsCache = { key: cacheKey(options), at: Date.now(), result };
  return result;
}

export async function probeListeningPorts(
  options: PortsProbeOptions = {},
): Promise<PortsProbeResult> {
  const { includeUdp = false, host = undefined, timeoutMs = 3000 } = options;

  const remote = (cmd: string): string | null =>
    host ? sshCommand(host, cmd) : cmd;

  const attempts: { source: "ss" | "netstat"; command: string | null }[] = [
    { source: "ss", command: remote(includeUdp ? "ss -tulnp 2>/dev/null" : "ss -tlnp 2>/dev/null") },
    // Headered variant for older iproute2 builds without -p-aware parsing.
    { source: "ss", command: remote(includeUdp ? "ss -tuln 2>/dev/null" : "ss -tln 2>/dev/null") },
    {
      source: "netstat",
      command: remote(includeUdp ? "netstat -tulnp 2>/dev/null" : "netstat -tlnp 2>/dev/null"),
    },
  ];

  for (const attempt of attempts) {
    if (!attempt.command) {
      return failedResult(options, `invalid open-ports host: ${host}`);
    }
    const stdout = await runShell(attempt.command, timeoutMs);
    if (stdout === null) continue;
    const rows = parseListeningPorts(stdout);
    if (rows.length > 0 || attempt.source === "netstat") {
      const result: PortsProbeResult = {
        rows,
        error: null,
        host: host ?? null,
        source: attempt.source,
      };
      portsCache = { key: cacheKey(options), at: Date.now(), result };
      return result;
    }
  }

  // /proc/net is only reachable locally; a remote host without ss/netstat is
  // "unknown" rather than silently zero.
  if (!host) {
    const rows = readProcListeningPorts(includeUdp);
    if (rows && rows.length > 0) {
      const result: PortsProbeResult = {
        rows,
        error: null,
        host: null,
        source: "proc",
      };
      portsCache = { key: cacheKey(options), at: Date.now(), result };
      return result;
    }
  }

  return failedResult(
    options,
    `no listening sockets reported (probe timed out after ${timeoutMs}ms)`,
  );
}

/**
 * Probe on behalf of a render path: serves a fresh cache hit immediately and
 * de-duplicates concurrent callers, so three surfaces asking at once still
 * spawn one `ss`.
 */
export async function requestPorts(
  options: PortsProbeOptions = {},
): Promise<PortsProbeResult> {
  const cached = peekPorts(options);
  if (cached) return cached;

  const key = cacheKey(options);
  if (portsInFlight && portsInFlight.key === key) return portsInFlight.promise;

  const promise = probeListeningPorts(options)
    .then((result) => {
      notifyPortsUpdate();
      return result;
    })
    .finally(() => {
      if (portsInFlight && portsInFlight.key === key) portsInFlight = null;
    });
  portsInFlight = { key, promise };
  return promise;
}

// ---------------------------------------------------------------------------
// Render-path reader
// ---------------------------------------------------------------------------

/** What a segment renders: the last known rows plus whether they're stale. */
export interface PortsRenderSnapshot {
  rows: ListeningPort[];
  /** `null` until the first probe for this target completes. */
  total: number | null;
  error: string | null;
  host: string | null;
  /** True while the value on screen predates the TTL or no probe has landed. */
  stale: boolean;
}

/**
 * The only ports API a render path may call.
 *
 * Never spawns: it returns the memoised result (even past its TTL — serve
 * stale, so the number on screen does not flicker to `--` between probes) and
 * schedules a background refresh, notifying `subscribePortsUpdates` listeners
 * when it lands.
 */
export function readPorts(options: PortsProbeOptions = {}): PortsRenderSnapshot {
  const key = cacheKey(options);
  const cached = portsCache?.key === key ? portsCache : null;
  const fresh = Boolean(cached && Date.now() - cached!.at <= PORTS_CACHE_TTL_MS);
  if (!fresh) void requestPorts(options);

  if (!cached) {
    return { rows: [], total: null, error: null, host: options.host ?? null, stale: true };
  }
  const result = cached.result;
  return {
    rows: result.rows,
    total: summarizePorts(result.rows).total,
    error: result.error,
    host: result.host,
    stale: !fresh,
  };
}