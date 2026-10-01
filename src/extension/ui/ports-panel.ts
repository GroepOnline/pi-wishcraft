/**
 * ports-panel.ts
 * ---------------------------------------------------------------------------
 * The open-ports panel behind `alt+i` (and the shared renderer for the Deck's
 * Ports route).
 *
 * Replaces the old `showOpenPortsList`, which ran `execSync` with **no
 * timeout** — a wedged `ss`, or an SSH host that never answered, froze the
 * whole TUI — and then dumped raw `ss` output on screen. This version:
 *
 *   • probes asynchronously with a bounded timeout (never blocks the UI),
 *   • renders parsed rows: proto · port · addresses · owner,
 *   • leads with a summary (`21 tcp · 12 exposed · 9 loopback · local`),
 *   • filters as you type, `r` re-probes, enter copies one row.
 * ---------------------------------------------------------------------------
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, type SelectItem, SelectList } from "@earendil-works/pi-tui";

import { tr } from "../../i18n/index.ts";
import { config } from "../core/state.ts";
import {
  filterPorts,
  formatAddresses,
  formatOwner,
  formatPortsSummary,
  probeListeningPorts,
  summarizePorts,
  type ListeningPort,
  type PortsProbeResult,
} from "../../segments/ports.ts";
import {
  overlaySelectListTheme,
  renderOverlayBox,
} from "./overlay-chrome.ts";

export interface PortsPanelOptions {
  includeUdp?: boolean;
  host?: string;
  /** Overrides the default panel heading. */
  title?: string;
}

/**
 * Fill unset options from `powerline.segmentOptions.openPorts` so every entry
 * point (alt+i, /open-ports, the classic menu) probes the same target as the
 * status segment and the Deck's Ports route. Explicit options still win.
 */
export function resolvePortsPanelOptions(
  options: PortsPanelOptions = {},
): Required<Pick<PortsPanelOptions, "includeUdp">> &
  Pick<PortsPanelOptions, "host" | "title"> {
  const openPorts = config.segmentOptions?.openPorts;
  return {
    includeUdp:
      options.includeUdp ?? openPorts?.includeUdp === true,
    host: options.host ?? openPorts?.host,
    title: options.title,
  };
}

const NONE_VALUE = "__none__";

function rowValue(row: ListeningPort): string {
  return `${row.proto}:${row.port} ${formatAddresses(row.addresses)} ${formatOwner(row)}`;
}

function rowLabel(row: ListeningPort): string {
  const proto = row.proto.padEnd(4);
  const port = String(row.port).padStart(5);
  const address = formatAddresses(row.addresses).padEnd(18);
  return `${proto} ${port}  ${address} ${formatOwner(row)}`;
}

function defaultTitle(host: string | null): string {
  return host
    ? tr("ports.titleHost", "Open ports · {host}", { host })
    : tr("ports.title", "Open ports");
}

/** Build the selectable rows from a probe result (pure — exported for tests). */
export function portsPanelItems(rows: readonly ListeningPort[]): SelectItem[] {
  return rows.map((row) => ({ label: rowLabel(row), value: rowValue(row) }));
}

function listFor(
  items: readonly SelectItem[],
  query: string,
  maxVisible: number,
  theme: Theme,
): SelectList {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? items.filter((item) =>
        `${item.label}\n${item.value}`.toLowerCase().includes(q),
      )
    : [...items];
  const visible =
    filtered.length > 0
      ? filtered
      : [{ label: tr("ports.noMatch", "no match for '{q}'", { q: query }), value: NONE_VALUE }];
  return new SelectList(
    visible,
    Math.max(1, Math.min(maxVisible, visible.length)),
    overlaySelectListTheme(theme),
  );
}

/**
 * Open the panel. Resolves when the overlay closes.
 *
 * The probe runs before the overlay opens so a slow fleet host shows a
 * bounded wait rather than an empty box; `r` re-probes in place.
 */
export async function showPortsPanel(
  ctx: any,
  options: PortsPanelOptions = {},
): Promise<void> {
  const resolved = resolvePortsPanelOptions(options);
  const includeUdp = resolved.includeUdp;
  const host = resolved.host;

  let probe: PortsProbeResult = await probeListeningPorts({ includeUdp, host });

  await ctx.ui.custom(
    (tui: any, theme: Theme, _keybindings: any, done: (result: null) => void) => {
      let query = "";
      let refreshPending = false;
      let selectList = listFor(portsPanelItems(probe.rows), query, 20, theme);

      const bind = () => {
        selectList.onSelect = (item) => {
          if (item.value === NONE_VALUE) return;
          ctx.ui.notify(tr("ports.copied", "Port: {row}", { row: item.value }), "info");
          done(null);
        };
        selectList.onCancel = () => done(null);
      };
      bind();

      const summaryLine = (): string => {
        if (probe.rows.length === 0 && probe.error) return probe.error;
        return formatPortsSummary(
          summarizePorts(probe.rows),
          probe.host,
          includeUdp,
        );
      };

      const title = () => `${resolved.title ?? defaultTitle(probe.host)} — ${summaryLine()}`;

      const hint = () => {
        const parts = [
          tr("ports.hintNav", "↑↓ select · enter copy · esc close"),
          tr("ports.hintRefresh", "r refresh"),
          query
            ? tr("ports.hintFilter", "filter '{q}' · ctrl+u clear", { q: query })
            : tr("ports.hintType", "type to filter"),
        ];
        return parts.join(" · ");
      };

      const body = () => {
        if (refreshPending) {
          return [tr("ports.probing", "probing listening sockets…")];
        }
        if (probe.rows.length === 0) {
          return [
            probe.error ?? tr("ports.none", "no listening sockets"),
            "",
            tr("ports.hintUdp", "UDP is off — press r after enabling Ports include UDP"),
          ];
        }
        return selectList.render(120);
      };

      return {
        render: (width: number) =>
          renderOverlayBox(theme, width, title(), body(), hint()),
        invalidate: () => selectList.invalidate(),
        handleInput: (data: string) => {
          if (matchesKey(data, "escape") || data === "\x03") {
            done(null);
            return;
          }

          if (data === "r" || data === "R") {
            if (refreshPending) return;
            refreshPending = true;
            tui.requestRender();
            void probeListeningPorts({ includeUdp, host }).then((next) => {
              probe = next;
              refreshPending = false;
              query = "";
              selectList = listFor(portsPanelItems(probe.rows), query, 20, theme);
              bind();
              tui.requestRender();
            });
            return;
          }

          if (data === "\x15") {
            query = "";
          } else if (matchesKey(data, "backspace")) {
            query = query.slice(0, -1);
          } else if (data.length === 1 && data >= " " && data <= "~") {
            query += data;
          } else {
            selectList.handleInput(data);
            tui.requestRender();
            return;
          }

          selectList = listFor(portsPanelItems(probe.rows), query, 20, theme);
          bind();
          tui.requestRender();
        },
      };
    },
    {
      overlay: true,
      overlayOptions: () => ({
        verticalAlign: "center",
        horizontalAlign: "center",
      }),
    },
  );
}

/**
 * `alt+i` entry point. Kept under its historical name because the shortcut
 * handler and docs refer to it as the "info" view.
 */
export async function showOpenPortsList(
  ctx: any,
  options: PortsPanelOptions = {},
): Promise<void> {
  await showPortsPanel(ctx, options);
}
