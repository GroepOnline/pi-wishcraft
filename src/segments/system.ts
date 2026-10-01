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
import {
  parseListeningPorts,
  readPorts,
  requestPorts,
  type ListeningPort,
} from "./ports.ts";

/**
 * Number of listening ports for the status rail, or `-1` when unknown.
 *
 * Counts UNIQUE TCP listening ports (dedupes IPv4/IPv6 dual-stack and
 * repeated multicast binds). UDP is noisy (mDNS/DHCP/ephemeral) so it's
 * opt-in. A configured host switches to a best-effort SSH probe (fleet
 * open-ports).
 *
 * Render-path safe: this reads the shared async probe cache and schedules a
 * background refresh — it never spawns `ss`. Previously it ran `execSync`
 * with a 3s timeout on every cache expiry, stalling the 33ms render cadence.
 */
export function countListeningPorts(includeUdp = false, host?: string): number {
  return readPorts({ includeUdp, host }).total ?? -1;
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
  return toOpenPortProcesses(parseListeningPorts(text));
}

/** Project shared-probe rows into the legacy detail shape (pure). */
export function toOpenPortProcesses(
  rows: readonly ListeningPort[],
): OpenPortProcess[] {
  return rows.map((row) => ({
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

/**
 * Best-effort process owners for listening ports, optionally probed over SSH
 * for a fleet host.
 *
 * Reads the shared async probe cache and schedules a background refresh, so
 * opening the ports detail never spawns a process on a keystroke. Subscribe to
 * `subscribePortsUpdates` and rebuild once the refresh lands.
 */
export function listOpenPortProcesses(
  includeUdp = false,
  host?: string,
): OpenPortProcess[] {
  return toOpenPortProcesses(readPorts({ includeUdp, host }).rows);
}

/**
 * Warm the probe for a detail view that is about to open, so the first paint
 * already has rows instead of an empty list.
 */
export function ensureOpenPortProcesses(
  includeUdp = false,
  host?: string,
): Promise<void> {
  return requestPorts({ includeUdp, host }).then(() => undefined);
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

// open_ports reads the shared async probe cache: no process is spawned from
// this render, and the footer repaints ~every 33ms while streaming. `?` shows
// until the first probe lands; a `subscribePortsUpdates` re-render fills it in.
export const openPortsSegment: StatusLineSegment = {
  id: "open_ports",
  render(ctx) {
    const includeUdp = ctx.options?.openPorts?.includeUdp === true;
    const host = ctx.options?.openPorts?.host;
    const { total } = readPorts({ includeUdp, host });
    const protocol = includeUdp ? "tcp+udp" : "tcp";
    const text = total === null ? `? ${protocol}` : `${total} ${protocol}`;
    return {
      content: withIcon(getIcons().ports, color(ctx, "queue", text)),
      visible: true,
    };
  },
};
