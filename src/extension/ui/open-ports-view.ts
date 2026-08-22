import { copyToClipboard } from "@earendil-works/pi-coding-agent";
import type { SelectItem } from "@earendil-works/pi-tui";
import { execSync } from "node:child_process";

import {
  countListeningPorts,
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
    const host = config.segmentOptions?.openPorts?.host;
    if (host && !sanitizeSshHost(host)) {
      ctx.ui.notify(`Invalid open-ports host: ${host}`, "error");
      return;
    }
    const proto = includeUdp ? "-tulnp" : "-tlnp";
    const command = host
      ? `ssh -o ConnectTimeout=3 -o BatchMode=yes -- ${host} "ss ${proto} 2>/dev/null" 2>/dev/null`
      : `ss ${proto} 2>/dev/null`;
    // execSync defaults to no timeout; cap it so a stalled ss/ssh probe
    // cannot block the extension event loop (ConnectTimeout only covers
    // SSH connection setup).
    const stdout = execSync(command, { encoding: "utf8", timeout: 3000 });
    publishPowerlineStatuses(ctx, {
      ports: formatPortsStatusValue(countListeningPorts(includeUdp, host)),
    });
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
