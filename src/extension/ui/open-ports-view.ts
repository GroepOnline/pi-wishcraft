import { copyToClipboard } from "@earendil-works/pi-coding-agent";
import type { SelectItem } from "@earendil-works/pi-tui";

import {
  parseListeningPortsFromText,
  probeListeningPorts,
  sanitizeSshHost,
} from "../../segments/system.ts";
import { config } from "../core/state.ts";
import {
  formatPortsStatusValue,
  publishPowerlineStatuses,
} from "../core/status-export.ts";
import { showSelectOverlay } from "./overlay-chrome.ts";

/** Full open-ports list as a scrollable overlay (the Info view). */
export async function showOpenPortsList(ctx: any): Promise<void> {
  try {
    const includeUdp = config.segmentOptions?.openPorts?.includeUdp === true;
    const configuredHost = config.segmentOptions?.openPorts?.host;
    let host: string | undefined;
    if (configuredHost) {
      host = sanitizeSshHost(configuredHost) ?? undefined;
      if (!host) {
        ctx.ui.notify(`Invalid open-ports host: ${configuredHost}`, "error");
        return;
      }
    }
    // probeListeningPorts caps each probe at 3s and falls back to netstat when
    // ss is unavailable; ConnectTimeout only covers SSH connection setup.
    // Probe once and derive the count from the same output — two sequential
    // probe sequences could block for up to ~12s combined.
    const stdout = probeListeningPorts(includeUdp, host);
    const portCount = stdout === null
      ? (host ? -1 : countListeningPorts(includeUdp, host))
      : parseListeningPortsFromText(stdout).size;
    publishPowerlineStatuses(ctx, {
      ports: formatPortsStatusValue(portCount),
    });
    if (stdout === null) {
      ctx.ui.notify("Could not list ports (ss/netstat unavailable)", "warning");
      return;
    }
    const lines = stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const start = /^(Proto|Netid|State|Local)/.test(lines[0] ?? "") ? 1 : 0;
    const rows = lines.slice(start);
    if (rows.length === 0) {
      ctx.ui.notify("No listening sockets", "info");
      return;
    }
    const items: SelectItem[] = rows.map((line) => ({
      label: line,
      value: line,
    }));
    const picked = await showSelectOverlay(
      ctx,
      host ? `Open ports · ${host}` : "Open ports",
      "↑↓ navigate · enter copy · esc close",
      items,
      Math.min(items.length, 24),
    );
    if (picked) {
      try {
        await copyToClipboard(picked.value);
        ctx.ui.notify("Port line copied to clipboard", "info");
      } catch {
        ctx.ui.notify(`Could not copy: ${picked.value}`, "warning");
      }
    }
  } catch (error) {
    ctx.ui.notify(
      `Failed to list ports: ${error instanceof Error ? error.message : String(error)}`,
      "error",
    );
  }
}
