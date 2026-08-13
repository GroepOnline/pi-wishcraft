import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { StatusLineSegment } from "../config/types.ts";
import { normalizeCompactExtensionStatus } from "../config/powerline-config.ts";
import { getIcons, SEP_DOT } from "../theme/icons.ts";
import { formatUsdCost } from "../usage/rates.ts";
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

    const label = ctx.segmentLabels?.get("subagents");
    const cost =
      formatUsdCost(subagentCost, ctx.options.cost?.currency) ?? "sub";
    const text = label ? `${label} ${cost}` : `sub ${cost}`;
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

export function countListeningPorts(includeUdp = false): number {
  // ponytail: count UNIQUE TCP listening ports (dedupes IPv4/IPv6 dual-stack and
  // repeated multicast binds). UDP is noisy (mDNS/DHCP/ephemeral) so it's opt-in.
  const run = (cmd: string): string | null => {
    try {
      return execSync(cmd, { encoding: "utf8", timeout: 2000 });
    } catch {
      return null;
    }
  };
  const proto = includeUdp ? "-tulnH" : "-tlnH";
  let out = run(`ss ${proto} 2>/dev/null`);
  if (out === null) out = run(`ss ${proto.replace("H", "")} 2>/dev/null`);
  if (out === null)
    out = run(
      includeUdp ? "netstat -tuln 2>/dev/null" : "netstat -tln 2>/dev/null",
    );
  if (out === null) return readProcListeningPorts(includeUdp);

  const lines = out
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const start = /^(Proto|Netid|State|Local)/.test(lines[0] ?? "") ? 1 : 0;
  const ports = new Set<number>();
  for (const line of lines.slice(start)) {
    // ss/netstat put the local address at different columns; take the first addr:port token
    for (const col of line.split(/\s+/)) {
      const m = /:(\d+)$/.exec(col);
      if (m) {
        ports.add(Number(m[1]));
        break;
      }
    }
  }
  return ports.size;
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

// Rolling 1-second sliding window of (timestamp, cumulative tokens) samples.
// Renders fire every ~33ms during streaming, so a per-render delta spikes (tiny
// dt); a fixed ~1s lookback gives a stable, honest tokens/sec over the last
// second. We track output and input separately so the segment can report both.
const tpsSamples: { at: number; output: number; input: number }[] = [];

function rateText(rate: number): string {
  return rate >= 100 ? Math.round(rate).toString() : rate.toFixed(1);
}

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
    const { output, input } = ctx.usageStats ?? { output: 0, input: 0 };
    const now = Date.now();
    tpsSamples.push({ at: now, output, input });
    // keep the last 5s of samples; drop everything older (idle gaps get forgotten)
    while (tpsSamples.length > 0 && now - tpsSamples[0].at > 5000)
      tpsSamples.shift();
    if (tpsSamples.length > 240) tpsSamples.splice(0, tpsSamples.length - 240);

    // pick the sample closest to 1s old (window [0.5s, 2s]) for a stable rate
    let ref: { at: number; output: number; input: number } | null = null;
    let bestDelta = Infinity;
    for (const s of tpsSamples) {
      const age = now - s.at;
      if (age < 500) continue;
      const d = Math.abs(age - 1000);
      if (d < bestDelta) {
        bestDelta = d;
        ref = s;
      }
    }
    let outRate = 0;
    let inRate = 0;
    if (ref) {
      const dt = (now - ref.at) / 1000;
      const dOut = output - ref.output;
      const dIn = input - ref.input;
      if (dt > 0 && dOut >= 0) outRate = dOut / dt;
      if (dt > 0 && dIn >= 0) inRate = dIn / dt;
    }
    const icons = getIcons();
    const parts: string[] = [];
    if (outRate > 0) parts.push(`${icons.output}${rateText(outRate)}`);
    if (inRate > 0) parts.push(`${icons.input}${rateText(inRate)}`);
    const valueText = parts.length > 0 ? parts.join(" ") : "0";
    const label = ctx.segmentLabels?.get("tps");
    const text = label ? `${label} ${valueText}` : valueText;
    const active = outRate > 0 || inRate > 0;
    // levendig: light up in the tokens color while generating, dim while idle
    return {
      content: withIcon(icons.tps, color(ctx, active ? "tokens" : "queue", text)),
      visible: true,
    };
  },
};

// open_ports runs blocking `ss`/`netstat`; cache the count so it doesn't respawn
// a process on every repaint (the footer repaints ~every 33ms while streaming).
const openPortsCache = new Map<boolean, { at: number; count: number }>();
const OPEN_PORTS_TTL_MS = 2000;

export const openPortsSegment: StatusLineSegment = {
  id: "open_ports",
  render(ctx) {
    const includeUdp = ctx.options?.openPorts?.includeUdp === true;
    const now = Date.now();
    let entry = openPortsCache.get(includeUdp);
    if (!entry || now - entry.at >= OPEN_PORTS_TTL_MS) {
      entry = { at: now, count: countListeningPorts(includeUdp) };
      openPortsCache.set(includeUdp, entry);
    }
    const label = ctx.segmentLabels?.get("open_ports");
    const text = label ? `${label} ${entry.count}` : String(entry.count);
    return {
      content: withIcon(getIcons().ports, color(ctx, "queue", text)),
      visible: true,
    };
  },
};
