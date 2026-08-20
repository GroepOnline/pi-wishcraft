import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  type SelectItem,
  SelectList,
  truncateToWidth,
} from "@earendil-works/pi-tui";
import { execSync } from "node:child_process";

import type { StatusLinePreset, StatusLineSegmentId } from "../../config/types.ts";
import { getPreset, PRESETS } from "../../config/presets.ts";
import { mergeSegmentsWithCustomItems } from "../../config/powerline-config.ts";
import {
  countListeningPorts,
  sanitizeSshHost,
} from "../../segments/system.ts";
import {
  writePowerlineDisabledSegmentSetting,
  writePowerlinePresetSetting,
} from "../settings/settings-io.ts";
import { renderSegmentWithWidth } from "./layout.ts";
import {
  buildSegmentContext,
  requestImmediateStatusRender,
} from "../core/segment-context.ts";
import {
  formatPortsStatusValue,
  publishPowerlineStatuses,
} from "../core/status-export.ts";
import { config, setConfig } from "../core/state.ts";
import type { RuntimeState } from "../core/types.ts";

export function overlaySelectListTheme(theme: Theme) {
  return {
    selectedPrefix: (text: string) => theme.fg("accent", text),
    selectedText: (text: string) => theme.fg("accent", text),
    description: (text: string) => theme.fg("muted", text),
    scrollInfo: (text: string) => theme.fg("dim", text),
    noMatch: (text: string) => theme.fg("warning", text),
  };
}

export async function showSelectOverlay(
  ctx: any,
  title: string,
  hint: string,
  items: SelectItem[],
  maxVisible: number,
): Promise<SelectItem | null> {
  return ctx.ui.custom(
    (
      tui: any,
      theme: Theme,
      _keybindings: any,
      done: (result: SelectItem | null) => void,
    ) => {
      const selectList = new SelectList(
        items,
        maxVisible,
        overlaySelectListTheme(theme),
      );
      const border = (text: string) => theme.fg("dim", text);
      const wrapRow = (text: string, innerWidth: number): string => {
        return `${border("│")}${truncateToWidth(text, innerWidth, "…", true)}${border("│")}`;
      };

      selectList.onSelect = (item) => done(item);
      selectList.onCancel = () => done(null);

      return {
        render: (width: number) => {
          const innerWidth = Math.max(1, width - 2);
          const lines: string[] = [];

          lines.push(border(`╭${"─".repeat(innerWidth)}╮`));
          lines.push(
            wrapRow(theme.fg("accent", theme.bold(title)), innerWidth),
          );
          lines.push(border(`├${"─".repeat(innerWidth)}┤`));

          for (const line of selectList.render(innerWidth)) {
            lines.push(wrapRow(line, innerWidth));
          }

          lines.push(border(`├${"─".repeat(innerWidth)}┤`));
          lines.push(wrapRow(theme.fg("dim", hint), innerWidth));
          lines.push(border(`╰${"─".repeat(innerWidth)}╯`));

          return lines;
        },
        invalidate: () => selectList.invalidate(),
        handleInput: (data: string) => {
          selectList.handleInput(data);
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
      ? `ssh -o ConnectTimeout=3 -o BatchMode=yes ${host} "ss ${proto} 2>/dev/null" 2>/dev/null`
      : `ss ${proto} 2>/dev/null`;
    const stdout = execSync(command, { encoding: "utf8" });
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
    if (picked) ctx.ui.notify(`Port: ${picked.value}`, "info");
  } catch (error) {
    ctx.ui.notify(
      `Failed to list ports: ${error instanceof Error ? error.message : String(error)}`,
      "error",
    );
  }
}

/** Alle segment-ids van de huidige preset + custom items (voor menu's). */
function mergedIds(): string[] {
  const presetDef = getPreset(config.preset);
  const merged = mergeSegmentsWithCustomItems(presetDef, config.customItems, {
    layout: config.layout,
    disabledSegments: [],
  });
  return [
    ...new Set([
      ...merged.leftSegments,
      ...merged.rightSegments,
      ...merged.secondarySegments,
    ]),
  ] as string[];
}

/** Configure sub-menu: preset, TPS value/label, ports UDP, segment labels. */
export async function configurePowerline(
  rt: RuntimeState,
  ctx: any,
): Promise<void> {
  const picked = await showSelectOverlay(
    ctx,
    "Powerline · configure",
    "↑↓ navigate · enter open · esc back",
    [
      {
        value: "preset",
        label: "Change preset",
        description: "Switch a built-in layout",
      },
      {
        value: "tps",
        label: "Set TPS value",
        description: "Override POWERLINE_TPS",
      },
      {
        value: "tps-clear",
        label: "Clear TPS override",
        description: "Use the live 1s window",
      },
      {
        value: "udp",
        label: "Toggle UDP in open-ports",
        description: "Include noisy UDP listeners",
      },
      {
        value: "label",
        label: "Set segment label",
        description: "Custom text beside a segment",
      },
      {
        value: "visibility",
        label: "Toggle segment visibility",
        description: "Hide or show a live segment",
      },
      {
        value: "summary",
        label: "Show current config",
        description: "Preset, TPS, UDP, labels",
      },
    ],
    8,
  );
  if (!picked) return;
  if (picked.value === "preset") {
    const names = Object.keys(PRESETS) as StatusLinePreset[];
    const presetPick = await showSelectOverlay(
      ctx,
      "Preset",
      "↑↓ navigate · enter apply · esc back",
      names.map((name) => ({
        value: name,
        label: name,
        description: `Switch to ${name}`,
      })),
      Math.min(names.length, 12),
    );
    if (presetPick) {
      setConfig({ ...config, preset: presetPick.value as StatusLinePreset });
      writePowerlinePresetSetting(
        presetPick.value as StatusLinePreset,
        ctx.cwd ?? process.cwd(),
      );
      publishPowerlineStatuses(ctx, { preset: presetPick.value });
      ctx.ui.notify(`Preset: ${presetPick.value} (saved)`, "info");
      requestImmediateStatusRender(rt, { deferDuringTyping: false });
    }
    return;
  }
  if (picked.value === "tps") {
    const val = await ctx.ui.input(
      "TPS value",
      process.env.POWERLINE_TPS || "",
    );
    if (val && val.trim()) {
      process.env.POWERLINE_TPS = val.trim();
      publishPowerlineStatuses(ctx, { tps: val.trim() });
      ctx.ui.notify(`TPS override set: ${val.trim()}`, "info");
      requestImmediateStatusRender(rt, { deferDuringTyping: false });
    }
    return;
  }
  if (picked.value === "tps-clear") {
    delete process.env.POWERLINE_TPS;
    publishPowerlineStatuses(ctx, { tps: undefined });
    ctx.ui.notify("TPS override cleared (live rate)", "info");
    requestImmediateStatusRender(rt, { deferDuringTyping: false });
    return;
  }
  if (picked.value === "udp") {
    const now = config.segmentOptions?.openPorts?.includeUdp === true;
    const host = config.segmentOptions?.openPorts?.host;
    setConfig({
      ...config,
      segmentOptions: {
        ...config.segmentOptions,
        openPorts: { ...config.segmentOptions?.openPorts, includeUdp: !now },
      },
    });
    publishPowerlineStatuses(ctx, {
      ports: formatPortsStatusValue(countListeningPorts(!now, host)),
    });
    ctx.ui.notify(`Open-ports UDP: ${!now ? "on" : "off"}`, "info");
    requestImmediateStatusRender(rt, { deferDuringTyping: false });
    return;
  }
  if (picked.value === "label") {
    const id = await ctx.ui.input("Segment id", "tps");
    if (!id) return;
    const label = await ctx.ui.input(
      "Label text",
      config.segmentLabels[id] ?? "",
    );
    if (label === undefined) return;
    const labels = { ...config.segmentLabels };
    if (label.trim()) labels[id] = label.trim();
    else delete labels[id];
    setConfig({ ...config, segmentLabels: labels });
    ctx.ui.notify(`Label ${id}: ${label.trim() || "(cleared)"}`, "info");
    requestImmediateStatusRender(rt, { deferDuringTyping: false });
    return;
  }
  if (picked.value === "visibility") {
    const ids = [...mergedIds()];
    const visibilityPick = await showSelectOverlay(
      ctx,
      "Segment aan/uit",
      "↑↓ navigate · enter wisselt · esc back",
      ids.map((id) => ({
        value: id,
        label: `${config.disabledSegments.includes(id as never) ? "[ ]" : "[x]"} ${id}`,
        description: config.disabledSegments.includes(id as never)
          ? "Currently hidden"
          : "Currently visible",
      })),
      Math.min(ids.length, 12),
    );
    if (!visibilityPick) return;
    const id = visibilityPick.value as StatusLineSegmentId;
    const disabled = new Set<StatusLineSegmentId>(config.disabledSegments);
    if (disabled.has(id)) disabled.delete(id);
    else disabled.add(id);
    const list = [...disabled];
    setConfig({ ...config, disabledSegments: list });
    writePowerlineDisabledSegmentSetting(list, ctx.cwd ?? process.cwd());
    ctx.ui.notify(
      `${id}: ${disabled.has(id) ? "verborgen" : "zichtbaar"} (opgeslagen)`,
      "info",
    );
    requestImmediateStatusRender(rt, { deferDuringTyping: false });
    return;
  }
  if (picked.value === "summary") {
    const summary = [
      `preset: ${config.preset}`,
      `separator: ${config.separator ?? "(preset default)"}`,
      `tps: ${process.env.POWERLINE_TPS || "(live)"}`,
      `open_ports UDP: ${config.segmentOptions?.openPorts?.includeUdp ? "on" : "off"}`,
      `disabled: ${config.disabledSegments.join(",") || "(none)"}`,
      `labels: ${Object.keys(config.segmentLabels).join(",") || "(none)"}`,
    ].join("  ·  ");
    ctx.ui.notify(summary, "info");
  }
}

/** Activate a segment picked from the navigator (Enter). */
export async function activateSegment(
  rt: RuntimeState,
  ctx: any,
  picked: { id: string; label: string },
): Promise<void> {
  const id = picked.id;
  if (id === "__none__") return;
  if (id === "tps") {
    const current = process.env.POWERLINE_TPS || "(live, auto)";
    ctx.ui.notify(
      `TPS: ${current} — set via Configure or /tps <value>`,
      "info",
    );
    return;
  }
  if (id === "open_ports") {
    await showOpenPortsList(ctx);
    return;
  }
  if (id === "git") {
    ctx.ui.notify(
      `git branch: ${rt.footerDataRef?.getGitBranch() ?? "(no repo)"}`,
      "info",
    );
    return;
  }
  if (id === "cost") {
    ctx.ui.notify("Use /cost for the cost breakdown", "info");
    return;
  }
  if (id === "context_pct" || id === "context_total") {
    ctx.ui.notify("Context window shown in the bar", "info");
    return;
  }
  if (id === "queue") {
    ctx.ui.notify("Use /ideas to work the queue", "info");
    return;
  }
  const value = picked.label.replace(/^\S+\s+/, "");
  ctx.ui.notify(`${id}: ${value}`, "info");
}

/** Navigable overlay that mirrors the live powerline segments; arrow keys move, Enter activates. */
export async function showSegmentNavigator(
  rt: RuntimeState,
  ctx: any,
): Promise<{ id: string; label: string } | null> {
  return ctx.ui.custom(
    (
      tui: any,
      theme: Theme,
      _keybindings: any,
      done: (result: { id: string; label: string } | null) => void,
    ) => {
      // Build live segment values now that we have a theme
      const segCtx = buildSegmentContext(rt, ctx, theme);
      const presetDef = getPreset(config.preset);
      const merged = mergeSegmentsWithCustomItems(
        presetDef,
        segCtx.effectiveCustomItems,
        {
          layout: config.layout,
          disabledSegments: config.disabledSegments,
        },
      );
      const ids = [
        ...merged.leftSegments,
        ...merged.rightSegments,
        ...merged.secondarySegments,
      ];
      const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
      const items: SelectItem[] = [];
      for (const id of ids) {
        const rendered = renderSegmentWithWidth(id, segCtx);
        if (!rendered.visible) continue;
        const value = stripAnsi(rendered.content).trim() || "(empty)";
        items.push({ label: `${id}  ${value}`, value: id });
      }
      if (items.length === 0) {
        items.push({ label: "(no visible segments)", value: "__none__" });
      }
      const selectList = new SelectList(
        items,
        Math.min(items.length, 20),
        overlaySelectListTheme(theme),
      );
      const border = (text: string) => theme.fg("dim", text);
      const wrapRow = (text: string, innerWidth: number) =>
        `${border("│")}${truncateToWidth(text, innerWidth, "…", true)}${border("│")}`;
      selectList.onSelect = (item) =>
        done({ id: item.value, label: item.label });
      selectList.onCancel = () => done(null);
      return {
        render: (width: number) => {
          const innerWidth = Math.max(1, width - 2);
          const lines: string[] = [];
          lines.push(border(`╭${"─".repeat(innerWidth)}╮`));
          lines.push(
            wrapRow(
              theme.fg("accent", theme.bold("Powerline segments")),
              innerWidth,
            ),
          );
          lines.push(border(`├${"─".repeat(innerWidth)}┤`));
          for (const line of selectList.render(innerWidth))
            lines.push(wrapRow(line, innerWidth));
          lines.push(border(`├${"─".repeat(innerWidth)}┤`));
          lines.push(
            wrapRow(
              theme.fg("dim", "↑↓ navigate · enter activate · esc cancel"),
              innerWidth,
            ),
          );
          lines.push(border(`╰${"─".repeat(innerWidth)}╯`));
          return lines;
        },
        invalidate: () => selectList.invalidate(),
        handleInput: (data: string) => {
          selectList.handleInput(data);
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
