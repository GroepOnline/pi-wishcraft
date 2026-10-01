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
 * Everything here is pure except `probeListeningPorts`, which is deliberately
 * asynchronous: the UI must never block on a scan, least of all on an SSH
 * probe to a fleet host.
 * ---------------------------------------------------------------------------
 */

import { exec } from "node:child_process";

import { sshCommand } from "./probe-shell.ts";

/** A listening socket, deduped by protocol + port. */
export interface ListeningPort {
  proto: "tcp" | "udp";
  port: number;
  /** Every local bind address for this port (`0.0.0.0`, `127.0.0.1`, `::1`). */
  addresses: string[];
  /** `LISTEN` / `UNCONN` / `""` when the variant has no state column. */
  state: string;
  /** Owning process name when `ss -p`/`netstat -p` exposes it. */
  process: string | null;
  pid: number | null;
}

export interface PortsSummary {
  tcp: number;
  udp: number;
  total: number;
  /** Ports bound to a non-loopback address — reachable from other machines. */
  exposed: number;
  /** Ports bound only to loopback. */
  loopback: number;
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);

function isLoopbackAddress(address: string): boolean {
  return LOOPBACK.has(address) || address.startsWith("127.");
}

function parseProcessFromSs(line: string): { process: string | null; pid: number | null } {
  // iproute2 `ss -p`: users:(("sshd",pid=1071,fd=5)); older builds omit pid=.
  const match = /users:\(+\s*"([^"]*)"\s*,?\s*(?:pid=)?(\d+)?/.exec(line);
  if (!match) return { process: null, pid: null };
  return {
    process: match[1] || null,
    pid: match[2] ? Number(match[2]) : null,
  };
}

function parseProcessFromNetstat(tokens: string[]): { process: string | null; pid: number | null } {
  const last = tokens[tokens.length - 1] ?? "";
  const match = /^(\d+)\/(.+)$/.exec(last);
  return match ? { process: match[2] ?? null, pid: Number(match[1]) } : { process: null, pid: null };
}

function inferProto(token: string | undefined): "tcp" | "udp" | null {
  if (!token) return null;
  const lower = token.toLowerCase();
  if (lower.startsWith("tcp")) return "tcp";
  if (lower.startsWith("udp")) return "udp";
  return null;
}

/** First token that parses as a local `addr:port` / macOS `addr.port` bind. */
function findLocalBind(tokens: string[]): string | null {
  for (const token of tokens) {
    if (token.includes("users:")) continue;
    // The peer column ends in `:*` or `:*`, never bare digits, so it cannot
    // match — but skip it explicitly if it ever does.
    if (/^\d+$/.test(token)) continue;
    if (/(?::|\.)(\d+)$/.test(token) && /[:.]/.test(token.replace(/:\d+$/, ""))) {
      return token;
    }
  }
  return null;
}

function splitBind(bind: string): { address: string; port: number } | null {
  // Linux/ss: `127.0.0.1:631`, `[::1]:631`, `*:8080`.
  // macOS netstat: `*.5900`, `127.0.0.1.631`.
  // Brackets are stripped from IPv6 so `::1` compares equal to the loopback
  // set — leaving them on made an IPv6 loopback bind count as *exposed*.
  const strip = (address: string): string => {
    const unwrapped = address.startsWith("[") && address.endsWith("]")
      ? address.slice(1, -1)
      : address;
    return unwrapped || "*";
  };
  const colon = /:(\d+)$/.exec(bind);
  if (colon) {
    return {
      address: strip(bind.slice(0, bind.length - colon[0].length)),
      port: Number(colon[1]),
    };
  }
  const dot = /\.(\d+)$/.exec(bind);
  if (dot) {
    return {
      address: strip(bind.slice(0, bind.length - dot[0].length)),
      port: Number(dot[1]),
    };
  }
  return null;
}

/**
 * Parse `ss -tulnp` / `netstat -tulnp` output into deduped ports.
 *
 * Column layouts differ between `ss` with and without `-p`, between `ss -H`
 * and headered output, and between Linux and macOS `netstat` — so rather than
 * indexing fixed columns this scans for the protocol token, the state token
 * and the first plausible local bind. Header rows are skipped by pattern.
 */
export function parseListeningPorts(text: string): ListeningPort[] {
  const byKey = new Map<string, ListeningPort>();

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (/^(Netid|Proto|State|Local|Active|Destination)/i.test(line)) continue;

    const tokens = line.split(/\s+/);
    if (tokens.length < 4) continue;

    const proto = tokens.map(inferProto).find((value) => value !== null) ?? null;
    const bind = findLocalBind(tokens);
    if (!proto || !bind) continue;

    const parsed = splitBind(bind);
    if (!parsed || !Number.isFinite(parsed.port)) continue;

    const stateToken = tokens.find((token) => /^(LISTEN|UNCONN|ESTAB|CLOSED|TIME_WAIT)$/i.test(token));
    const { process, pid } =
      tokens.some((token) => token.includes("users:"))
        ? parseProcessFromSs(line)
        : parseProcessFromNetstat(tokens);

    const key = `${proto}:${parsed.port}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        proto,
        port: parsed.port,
        addresses: [parsed.address],
        state: stateToken ? stateToken.toUpperCase() : "",
        process,
        pid,
      });
      continue;
    }
    if (!existing.addresses.includes(parsed.address)) {
      existing.addresses.push(parsed.address);
    }
    // Prefer whichever duplicate row exposes an owner.
    if (existing.process === null && process !== null) {
      existing.process = process;
      existing.pid = pid;
    }
    if (!existing.state && stateToken) {
      existing.state = stateToken.toUpperCase();
    }
  }

  return [...byKey.values()].sort(
    (a, b) => a.port - b.port || (a.proto === b.proto ? 0 : a.proto === "tcp" ? -1 : 1),
  );
}

export function summarizePorts(rows: readonly ListeningPort[]): PortsSummary {
  let tcp = 0;
  let udp = 0;
  let exposed = 0;
  let loopback = 0;

  for (const row of rows) {
    if (row.proto === "tcp") tcp += 1;
    else udp += 1;
    const anyExposed = row.addresses.some(
      (address) => !isLoopbackAddress(address) && address !== "",
    );
    if (anyExposed) exposed += 1;
    else loopback += 1;
  }

  return { tcp, udp, total: rows.length, exposed, loopback };
}

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
  source: "ss" | "netstat" | "failed";
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
 * Results are memoised for `CACHE_TTL_MS` so the status rail, the `alt+i`
 * panel and the Deck route can all read the same probe instead of each
 * spawning `ss`.
 */
export const PORTS_CACHE_TTL_MS = 5000;

let portsCache: { key: string; at: number; result: PortsProbeResult } | null = null;
let portsInFlight: { key: string; promise: Promise<PortsProbeResult> } | null = null;

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
      const failed: PortsProbeResult = {
        rows: [],
        error: `invalid open-ports host: ${host}`,
        host: host ?? null,
        source: "failed",
      };
      portsCache = { key: cacheKey(options), at: Date.now(), result: failed };
      return failed;
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

  const failed: PortsProbeResult = {
    rows: [],
    error: `no listening sockets reported (probe timed out after ${timeoutMs}ms)`,
    host: host ?? null,
    source: "failed",
  };
  portsCache = { key: cacheKey(options), at: Date.now(), result: failed };
  return failed;
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

  const promise = probeListeningPorts(options).finally(() => {
    if (portsInFlight && portsInFlight.key === key) portsInFlight = null;
  });
  portsInFlight = { key, promise };
  return promise;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const PROTO_WIDTH = 4;

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length);
}

/** `0.0.0.0, 127.0.0.1` — the widest address first, then loopback. */
export function formatAddresses(addresses: readonly string[]): string {
  if (addresses.length === 0) return "*";
  const ordered = [...addresses].sort((a, b) => {
    const aLoop = isLoopbackAddress(a) ? 1 : 0;
    const bLoop = isLoopbackAddress(b) ? 1 : 0;
    if (aLoop !== bLoop) return aLoop - bLoop;
    // Plain codepoint order, not locale-aware: the output must be identical
    // on every machine regardless of the host locale.
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return ordered.join(", ");
}

export function formatOwner(row: ListeningPort): string {
  if (!row.process) return "(unknown)";
  return row.pid !== null ? `${row.process} (${row.pid})` : row.process;
}

/** One aligned table row; `width` truncates the owner column only. */
export function formatPortRow(row: ListeningPort, width = 80): string {
  const proto = pad(row.proto, PROTO_WIDTH);
  const port = pad(String(row.port), 5);
  const address = formatAddresses(row.addresses);
  const owner = formatOwner(row);
  const used = PROTO_WIDTH + 1 + 5 + 1 + address.length + 1;
  if (used >= width) {
    const clipped = `${proto} ${port} ${address}`;
    return clipped.slice(0, Math.max(1, width));
  }
  const room = width - used;
  const clippedOwner =
    owner.length > room ? `${owner.slice(0, Math.max(1, room - 1))}…` : owner;
  return `${proto} ${port} ${address} ${clippedOwner}`;
}

/** Column header matching `formatPortRow`'s alignment. */
export function portsTableHeader(): string {
  return `${pad("PROTO", PROTO_WIDTH)} ${pad("PORT", 5)} ADDRESS OWNER`;
}

/**
 * Summary line for the panel head, e.g.
 * `21 tcp · 2 udp · 12 exposed · 9 loopback · sofielocal`.
 */
export function formatPortsSummary(
  summary: PortsSummary,
  host: string | null,
  includeUdp: boolean,
): string {
  const parts = [
    `${summary.tcp} tcp`,
    includeUdp ? `${summary.udp} udp` : null,
    `${summary.exposed} exposed`,
    `${summary.loopback} loopback`,
    host ? `via ${host}` : "local",
  ].filter((part): part is string => part !== null);
  return parts.join(" · ");
}

/**
 * Full table body: header, one row per port, and a truncation tail when
 * `maxRows` is exceeded. Shared by the `alt+i` overlay and the Deck route so
 * both surfaces always show the same numbers.
 */
export function portsTableLines(
  rows: readonly ListeningPort[],
  width: number,
  maxRows = 24,
): string[] {
  if (rows.length === 0) return [];
  const lines = [portsTableHeader()];
  const shown = rows.slice(0, maxRows);
  for (const row of shown) lines.push(formatPortRow(row, width));
  if (rows.length > shown.length) {
    lines.push(`… ${rows.length - shown.length} more (↑↓ to scroll)`);
  }
  return lines;
}

/** Free-text filter over port, address and owner — powers `/` in the panel. */
export function filterPorts(
  rows: readonly ListeningPort[],
  query: string,
): ListeningPort[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter(
    (row) =>
      String(row.port).includes(q) ||
      row.proto.includes(q) ||
      row.addresses.some((address) => address.toLowerCase().includes(q)) ||
      (row.process ?? "").toLowerCase().includes(q),
  );
}

/** Group rows by owning process — used to answer "what is holding ports?". */
export function groupPortsByProcess(
  rows: readonly ListeningPort[],
): { process: string; ports: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const row of rows) {
    const key = formatOwner(row);
    const list = groups.get(key) ?? [];
    list.push(`${row.proto}:${row.port}`);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .map(([process, ports]) => ({ process, ports }))
    .sort((a, b) => b.ports.length - a.ports.length || a.process.localeCompare(b.process));
}
