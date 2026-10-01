import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { StatusLineSegment } from "../config/types.ts";
import { normalizeCompactExtensionStatus } from "../config/powerline-config.ts";
import { getIcons, SEP_DOT } from "../theme/icons.ts";
import { formatUsdCost } from "../usage/rates.ts";
import {
  formatTpsRate,
  pushTpsSample,
  ratesFromRing,
  ringMsForWindow,
  tpsSamples,
} from "../usage/tps-ring.ts";
import { color, withIcon } from "./shared.ts";

// ═══════════════════════════════════════════════════════════════════════════
// Segment Implementations
// ═══════════════════════════════════════════════════════════════════════════

export const thinkingSegment: StatusLineSegment = {
  id: "thinking",
  render(ctx) {
    const level = ctx.thinkingLevel || "off";

    const levelText: Record<string, string> = {
      off: "off",
      minimal: "min",
      low: "low",
      medium: "med",
      high: "high",
      xhigh: "xhigh",
    };
    const label = levelText[level] || level;
    const content = `think:${label}`;

    if (level === "high" || level === "xhigh" || level === "max") {
      return { content: color(ctx, "thinking", content), visible: true };
    }

    if (level === "minimal") {
      return { content: color(ctx, "thinkingMinimal", content), visible: true };
    }
    if (level === "low") {
      return { content: color(ctx, "thinkingLow", content), visible: true };
    }
    if (level === "medium") {
      return { content: color(ctx, "thinkingMedium", content), visible: true };
    }

    return { content: color(ctx, "thinking", content), visible: true };
  },
};

export const subagentsSegment: StatusLineSegment = {
  id: "subagents",
  render(ctx) {
    const subagentCost = ctx.usageStats?.subagentCost ?? 0;
    if (!subagentCost) return { content: "", visible: false };

    const cost =
      formatUsdCost(subagentCost, ctx.options.cost?.currency) ?? "sub";
    const text = `sub ${cost}`;
    return {
      content: withIcon(getIcons().agents, color(ctx, "cost", text)),
      visible: true,
    };
  },
};

export const queueSegment: StatusLineSegment = {
  id: "queue",
  render(ctx) {
    const summary = ctx.queueSummary;
    const parts: string[] = [];

    if (summary.compacting && summary.queueCount > 0) {
      parts.push(`compact q ${summary.queueCount}`);
    } else if (summary.queueCount > 0) {
      parts.push(`q ${summary.queueCount}`);
    }

    if (summary.ideaCount > 0) {
      parts.push(`ideas ${summary.ideaCount}`);
    }

    if (summary.blockedCount > 0) {
      parts.push(`blocked ${summary.blockedCount}`);
    }

    if (parts.length === 0) return { content: "", visible: false };
    return { content: color(ctx, "queue", parts.join(SEP_DOT)), visible: true };
  },
};

export const extensionStatusesSegment: StatusLineSegment = {
  id: "extension_statuses",
  render(ctx) {
    const statuses = ctx.extensionStatuses;
    if (!statuses || statuses.size === 0)
      return { content: "", visible: false };

    // Join compact statuses with a separator
    // Skip: empty strings, notification-style ("[...") shown above editor,
    // and strings that are only ANSI codes with no visible text.
    // Also skip statuses explicitly elevated into dedicated custom segments.
    const parts: string[] = [];
    for (const [statusKey, value] of statuses.entries()) {
      if (ctx.hiddenExtensionStatusKeys.has(statusKey)) continue;
      const normalized = value ? normalizeCompactExtensionStatus(value) : null;
      if (normalized) {
        parts.push(normalized);
      }
    }

    if (parts.length === 0) return { content: "", visible: false };

    // Statuses already have their own styling applied by the extensions
    const content = parts.join(` ${SEP_DOT} `);
    return { content, visible: true };
  },
};

// Fleet-probe shell helpers live next to the shared ports parser; re-exported
// here so existing importers of `segments/system.ts` are unaffected.
export { sanitizeSshHost, sshCommand } from "./probe-shell.ts";
import { sshCommand } from "./probe-shell.ts";
import { parseListeningPorts } from "./ports.ts";

export function countListeningPorts(includeUdp = false, host?: string): number {
  // ponytail: count UNIQUE TCP listening ports (dedupes IPv4/IPv6 dual-stack and
  // repeated multicast binds). UDP is noisy (mDNS/DHCP/ephemeral) so it's opt-in.
  // A configured host switches to a best-effort SSH probe (fleet open-ports).
  const run = (cmd: string): string | null => {
    try {
      return execSync(cmd, { encoding: "utf8", timeout: 3000 });
    } catch {
      return null;
    }
  };
  const remote = (cmd: string): string | null =>
    host ? sshCommand(host, cmd) : cmd;

  const proto = includeUdp ? "-tulnH" : "-tlnH";
  const ssCmd = remote(`ss ${proto} 2>/dev/null`);
  let out = ssCmd === null ? null : run(ssCmd);
  if (out === null) {
    const fallback = remote(`ss ${proto.replace("H", "")} 2>/dev/null`);
    if (fallback !== null) out = run(fallback);
  }
  if (out === null) {
    const netstatCmd = remote(
      includeUdp ? "netstat -tuln 2>/dev/null" : "netstat -tln 2>/dev/null",
    );
    if (netstatCmd !== null) out = run(netstatCmd);
  }
  if (out === null) {
    // /proc/net is only reachable locally; a remote host without ss/netstat is
    // "unknown" rather than silently zero.
    return host ? -1 : readProcListeningPorts(includeUdp);
  }

  return parseListeningPortsFromText(out).size;
}

/**
 * Pure port-count parser shared by `countListeningPorts`. Accepts `ss` and
 * `netstat` output. The port separator is `:` on Linux/`ss`/`lsof` but `.` on
 * macOS `netstat` (`*.5900`, `127.0.0.1.631`); matching both keeps the
 * open-ports segment honest on macOS.
 *
 * ponytail: assumes LISTEN rows always carry a port on the local-address
 * column; a bare IPv4 with no port (not emitted by LISTEN output) would
 * false-match the `.<digits>` form.
 */
export function parseListeningPortsFromText(text: string): Set<number> {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const start = /^(Proto|Netid|State|Local)/.test(lines[0] ?? "") ? 1 : 0;
  const ports = new Set<number>();
  for (const line of lines.slice(start)) {
    // ss/netstat put the local address at different columns; take the first addr:port token
    for (const col of line.split(/\s+/)) {
      const m = /(?::|\.)(\d+)$/.exec(col);
      if (m) {
        ports.add(Number(m[1]));
        break;
      }
    }
  }
  return ports;
}

function readProcListeningPorts(includeUdp: boolean): number {
  // ponytail: last-resort /proc parse when ss/netstat are unavailable; dedupe by port
  const files = includeUdp ? ["tcp", "tcp6", "udp", "udp6"] : ["tcp", "tcp6"];
  const ports = new Set<number>();
  for (const f of files) {
    try {
      const data = readFileSync(`/proc/net/${f}`, "utf8");
      for (const line of data.split("\n")) {
        const cols = line.trim().split(/\s+/);
        if (cols.length < 4) continue;
        if (f.startsWith("tcp") && cols[3] !== "0A") continue; // LISTEN state
        const m = /:([0-9A-Fa-f]{1,4})$/.exec(cols[1]);
        if (m) ports.add(parseInt(m[1], 16));
      }
    } catch {
      // file may not exist; skip
    }
  }
  return ports.size;
}

// ═══════════════════════════════════════════════════════════════════════════
// Listening ports → owning process (best-effort, for the segment detail view)
// ═══════════════════════════════════════════════════════════════════════════

export interface OpenPortProcess {
  port: number;
  proto: "tcp" | "udp";
  /** Local bind address with the port stripped (e.g. `0.0.0.0`, `[::]`, `*`). */
  address: string;
  /** Human-readable owner (`sshd (1071)`), or null when the kernel hides it. */
  process: string | null;
}

/**
 * Parse `ss -tulnp` / `netstat -tulnp` output into a deduped, port-sorted
 * list of (proto, port → process).
 *
 * A thin projection over the shared `parseListeningPorts` parser, so the
 * segment detail, the `alt+i` list and the Deck ports route all interpret
 * `ss` output identically.
 */
export function parseOpenPortProcesses(text: string): OpenPortProcess[] {
  return parseListeningPorts(text).map((row) => ({
    port: row.port,
    proto: row.proto,
    address: row.addresses[0] ?? "",
    process:
      row.process === null
        ? null
        : row.pid !== null
          ? `${row.process} (${row.pid})`
          : row.process,
  }));
}

const openPortProcessesCache = new Map<
  string,
  { at: number; entries: OpenPortProcess[] }
>();
const OPEN_PORT_PROCESSES_TTL_MS = 2000;

/**
 * Best-effort process owners for listening ports via `ss -tulnp` (falls back
 * to `netstat -tulnp`), optionally probed over SSH for a fleet host. Cached
 * like the open_ports count so opening the ports detail does not spawn a
 * process on every keystroke.
 */
export function listOpenPortProcesses(
  includeUdp = false,
  host?: string,
): OpenPortProcess[] {
  const key = `${includeUdp ? "u" : "t"}:${host ?? ""}`;
  const now = Date.now();
  const cached = openPortProcessesCache.get(key);
  if (cached && now - cached.at < OPEN_PORT_PROCESSES_TTL_MS)
    return cached.entries;

  const run = (cmd: string): string | null => {
    try {
      return execSync(cmd, { encoding: "utf8", timeout: 3000 });
    } catch {
      return null;
    }
  };
  const remote = (cmd: string): string | null =>
    host ? sshCommand(host, cmd) : cmd;

  const ssCmd = remote(
    includeUdp ? "ss -tulnp 2>/dev/null" : "ss -tlnp 2>/dev/null",
  );
  let out = ssCmd === null ? null : run(ssCmd);
  if (out === null) {
    const netstatCmd = remote(
      includeUdp ? "netstat -tulnp 2>/dev/null" : "netstat -tlnp 2>/dev/null",
    );
    if (netstatCmd !== null) out = run(netstatCmd);
  }
  const entries = out === null ? [] : parseOpenPortProcesses(out);
  openPortProcessesCache.set(key, { at: now, entries });
  return entries;
}

// Rolling 1-second sliding window of (timestamp, cumulative tokens) samples.
// Math lives in src/usage/tps-ring.ts so `/tps` can read the same ring.

export const tpsSegment: StatusLineSegment = {
  id: "tps",
  render(ctx) {
    const override = process.env.POWERLINE_TPS?.trim();
    if (override) {
      return {
        content: withIcon(getIcons().tps, color(ctx, "tokens", override)),
        visible: true,
      };
    }
    const windowMs = ctx.options.tps?.windowMs ?? 1000;
    const { output, input } = ctx.usageStats ?? { output: 0, input: 0 };
    const now = Date.now();
    pushTpsSample(
      tpsSamples,
      { at: now, output, input },
      ringMsForWindow(windowMs),
    );
    const { inRate, outRate } = ratesFromRing(
      tpsSamples,
      now,
      { input, output },
      windowMs,
    );
    const icons = getIcons();
    const mode = ctx.options.tps?.mode ?? "both";
    const parts: string[] = [];
    if (mode !== "in" && outRate > 0) {
      parts.push(`${icons.output}${formatTpsRate(outRate)}`);
    }
    if (mode !== "out" && inRate > 0) {
      parts.push(`${icons.input}${formatTpsRate(inRate)}`);
    }
    // `0` looks like a measured rate and implies broken telemetry when the
    // agent is simply idle. `--` means no live generation sample yet.
    const valueText = parts.length > 0 ? parts.join(" ") : "--";
    return {
      content: withIcon(
        icons.tps,
        color(ctx, parts.length > 0 ? "tokens" : "queue", valueText),
      ),
      visible: true,
    };
  },
};

// open_ports runs blocking `ss`/`netstat`; cache the count so it doesn't respawn
// a process on every repaint (the footer repaints ~every 33ms while streaming).
const openPortsCache = new Map<string, { at: number; count: number }>();
const OPEN_PORTS_TTL_MS = 2000;

export const openPortsSegment: StatusLineSegment = {
  id: "open_ports",
  render(ctx) {
    const includeUdp = ctx.options?.openPorts?.includeUdp === true;
    const host = ctx.options?.openPorts?.host;
    const key = `${includeUdp ? "u" : "t"}:${host ?? ""}`;
    const now = Date.now();
    let entry = openPortsCache.get(key);
    if (!entry || now - entry.at >= OPEN_PORTS_TTL_MS) {
      entry = { at: now, count: countListeningPorts(includeUdp, host) };
      openPortsCache.set(key, entry);
    }
    const protocol = includeUdp ? "tcp+udp" : "tcp";
    const text = entry.count < 0 ? `? ${protocol}` : `${entry.count} ${protocol}`;
    return {
      content: withIcon(getIcons().ports, color(ctx, "queue", text)),
      visible: true,
    };
  },
};
