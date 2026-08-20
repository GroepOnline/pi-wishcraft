import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  matchesKey,
  type SelectItem,
  SelectList,
  truncateToWidth,
} from "@earendil-works/pi-tui";
import { execSync } from "node:child_process";

import type {
  StatusLinePreset,
  StatusLineSegmentId,
  StatusLineSeparatorStyle,
} from "../../config/types.ts";
import { getPreset, PRESETS, registerCustomPresets } from "../../config/presets.ts";
import { SEPARATOR_STYLES } from "../../config/primitives.ts";
import {
  countListeningPorts,
  listOpenPortProcesses,
  sanitizeSshHost,
} from "../../segments/system.ts";
import {
  writePowerlineCustomPresetSetting,
  writePowerlineOptionSetting,
  writePowerlinePresetSetting,
} from "../settings/settings-io.ts";
import {
  buildSegmentContext,
  requestImmediateStatusRender,
  resetLayoutCache,
} from "../core/segment-context.ts";
import { config, setConfig } from "../core/state.ts";
import {
  formatPortsStatusValue,
  publishPowerlineStatuses,
} from "../core/status-export.ts";
import type { RuntimeState } from "../core/types.ts";
import {
  buildConfigureItems,
  buildCustomPresetDef,
  buildCustomPresetSegmentIds,
  buildPresetEditorAddItems,
  buildSegmentDetailLines,
  buildSegmentItems,
  collectSegmentIds,
  configureItemsToSelectItems,
  segmentItemsToSelectItems,
  validatePresetName,
} from "./menu-items.ts";
import { overlaySelectListTheme, showSelectOverlay } from "./overlay-chrome.ts";
import { showTpsOverlay } from "./token-overlays.ts";
import { showWishcraftConfig } from "../settings/wishcraft-config.ts";

export { overlaySelectListTheme, showSelectOverlay } from "./overlay-chrome.ts";

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

/** Configure sub-menu: preset, TPS value/label, ports UDP, segment labels. */
export async function configurePowerline(
  rt: RuntimeState,
  ctx: any,
): Promise<void> {
  const picked = await showSelectOverlay(
    ctx,
    "Powerline · configure",
    "↑↓ navigate · enter select · esc back",
    configureItemsToSelectItems(),
    Math.min(buildConfigureItems().length, 12),
  );
  const choice = picked?.value;
  if (!choice) return;
  if (choice === "Open full settings (/wishcraft)…") {
    await showWishcraftConfig(rt, ctx);
    return;
  }
  if (choice === "Change preset") {
    const names = Object.keys(PRESETS) as StatusLinePreset[];
    const picked = await showSelectOverlay(
      ctx,
      "Preset",
      "↑↓ navigate · enter apply · esc back",
      names.map((name) => ({ label: name, value: name })),
      Math.min(names.length, 12),
    );
    if (picked) {
      setConfig({ ...config, preset: picked.value as StatusLinePreset });
      writePowerlinePresetSetting(
        picked.value as StatusLinePreset,
        ctx.cwd ?? process.cwd(),
      );
      publishPowerlineStatuses(ctx, { preset: picked.value });
      ctx.ui.notify(`Preset: ${picked.value} (saved)`, "info");
      requestImmediateStatusRender(rt, { deferDuringTyping: false });
    }
    return;
  }
  if (choice === "Set TPS value (POWERLINE_TPS)") {
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
  if (choice === "Clear TPS override (use live)") {
    delete process.env.POWERLINE_TPS;
    publishPowerlineStatuses(ctx, { tps: undefined });
    ctx.ui.notify("TPS override cleared (live rate)", "info");
    requestImmediateStatusRender(rt, { deferDuringTyping: false });
    return;
  }
  if (choice === "Toggle UDP in open-ports") {
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
  if (choice === "Toggle segment visibility…") {
    const ids = collectSegmentIds(config);
    const items: SelectItem[] = ids.map((id) => ({
      label: `${config.disabledSegments.includes(id) ? "◌" : "●"} ${id}`,
      value: id,
    }));
    const picked = await showSelectOverlay(
      ctx,
      "Toggle segments",
      "↑↓ navigate · enter toggle · esc close",
      items,
      Math.min(items.length, 20),
    );
    if (!picked) return;
    const id = picked.value as StatusLineSegmentId;
    const next = config.disabledSegments.includes(id)
      ? config.disabledSegments.filter((x) => x !== id)
      : [...config.disabledSegments, id];
    setConfig({ ...config, disabledSegments: next });
    const saved = writePowerlineOptionSetting(
      ctx.cwd ?? process.cwd(),
      { disabledSegments: next },
      config.preset,
    );
    ctx.ui.notify(
      `${next.includes(id) ? "Disabled" : "Enabled"}: ${id}${saved ? " (saved)" : " (not persisted; check settings.json)"}`,
      "info",
    );
    requestImmediateStatusRender(rt, { deferDuringTyping: false });
    return;
  }
  if (choice === "Set segment label…") {
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
  if (choice === "Build custom preset…") {
    await runPresetEditor(rt, ctx);
    return;
  }
  if (choice === "Show current config") {
    const summary = [
      `preset: ${config.preset}`,
      `separator: ${config.separator ?? "(preset default)"}`,
      `tps: ${process.env.POWERLINE_TPS || "(live)"}`,
      `open_ports UDP: ${config.segmentOptions?.openPorts?.includeUdp ? "on" : "off"}`,
      `disabled: ${config.disabledSegments.join(",") || "(none)"}`,
      `labels: ${Object.keys(config.segmentLabels).join(",") || "(none)"}`,
    ].join("  ·  ");
    ctx.ui.notify(summary, "info");
    return;
  }
}

/**
 * Interactive loop for one preset group (left/right/secondary): pick segments
 * one at a time from the remaining ids, choosing the done sentinel to finish.
 * Returns null when the user cancels with esc.
 */
async function pickPresetGroup(
  ctx: any,
  group: string,
  all: readonly StatusLineSegmentId[],
  initial: readonly StatusLineSegmentId[],
): Promise<StatusLineSegmentId[] | null> {
  const chosen: StatusLineSegmentId[] = [...initial];
  for (;;) {
    const items = buildPresetEditorAddItems(all, chosen);
    const picked = await showSelectOverlay(
      ctx,
      `Preset · ${group} segments`,
      "↑↓ pick · enter add · done to finish · esc cancel",
      items,
      Math.min(items.length, 20),
    );
    if (!picked || picked.value === "__done__") break;
    chosen.push(picked.value as StatusLineSegmentId);
  }
  return chosen;
}

/** Build a custom preset interactively and save it to settings + runtime. */
export async function runPresetEditor(
  rt: RuntimeState,
  ctx: any,
): Promise<void> {
  const rawName = await ctx.ui.input("Preset name", "");
  if (!rawName) return;
  const name = validatePresetName(rawName);
  if (!name) {
    ctx.ui.notify("Invalid preset name (a-z, 0-9, -, _)", "error");
    return;
  }

  const baseNames = Object.keys(PRESETS) as StatusLinePreset[];
  const basePick = await showSelectOverlay(
    ctx,
    "Base preset (colors + options)",
    "↑↓ navigate · enter select · esc cancel",
    baseNames.map((name) => ({ label: name, value: name })),
    Math.min(baseNames.length, 12),
  );
  if (!basePick) return;
  const base = getPreset(basePick.value as StatusLinePreset);

  const all = buildCustomPresetSegmentIds(config);
  const left = await pickPresetGroup(ctx, "left", all, base.leftSegments);
  if (!left) return;
  const right = await pickPresetGroup(ctx, "right", all, base.rightSegments);
  if (!right) return;
  const secondary = await pickPresetGroup(
    ctx,
    "secondary",
    all,
    base.secondarySegments ?? [],
  );
  if (!secondary) return;

  const separator = await showSelectOverlay(
    ctx,
    "Separator",
    "↑↓ navigate · enter select · esc cancel",
    (SEPARATOR_STYLES as unknown as string[]).map((name) => ({
      label: name,
      value: name,
    })),
    Math.min(SEPARATOR_STYLES.length, 12),
  );
  if (!separator) return;

  const def = buildCustomPresetDef(
    base,
    left,
    right,
    secondary,
    separator.value as StatusLineSeparatorStyle,
  );

  const saved = writePowerlineCustomPresetSetting(
    ctx.cwd ?? process.cwd(),
    name,
    def,
  );
  const presets = { ...config.presets, [name]: def };
  registerCustomPresets(presets);
  setConfig({ ...config, preset: name as StatusLinePreset, presets });
  resetLayoutCache(rt);
  requestImmediateStatusRender(rt, { deferDuringTyping: false });
  publishPowerlineStatuses(ctx, { preset: name });
  ctx.ui.notify(
    saved
      ? `Preset "${name}" saved and applied`
      : `Preset "${name}" applied (not persisted; check settings.json)`,
    saved ? "info" : "warning",
  );
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
    await showTpsOverlay(rt, ctx);
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

/**
 * Navigable overlay that mirrors the live powerline segments. Arrow keys move,
 * Enter activates, and →/tab opens a stacked per-segment detail view (←/esc
 * returns to the list). Pure item/detail building lives in `menu-items.ts`.
 */
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
      let segCtx = buildSegmentContext(rt, ctx, theme);
      let items = segmentItemsToSelectItems(buildSegmentItems(segCtx, config));
      let detailId: StatusLineSegmentId | null = null;
      let detailLines: ReturnType<typeof buildSegmentDetailLines> = [];

      const border = (text: string) => theme.fg("dim", text);
      const wrapRow = (text: string, innerWidth: number) =>
        `${border("│")}${truncateToWidth(text, innerWidth, "…", true)}${border("│")}`;

      const snapshot = () => {
        segCtx = buildSegmentContext(rt, ctx, theme);
        items = segmentItemsToSelectItems(buildSegmentItems(segCtx, config));
      };

      const buildDetail = (id: StatusLineSegmentId) =>
        id === "open_ports"
          ? buildSegmentDetailLines(
              id,
              segCtx,
              listOpenPortProcesses(
                config.segmentOptions?.openPorts?.includeUdp === true,
                config.segmentOptions?.openPorts?.host,
              ),
            )
          : buildSegmentDetailLines(id, segCtx);

      const openDetail = (id: string) => {
        if (id === "__none__") return;
        snapshot();
        detailId = id as StatusLineSegmentId;
        detailLines = buildDetail(detailId);
      };

      const finish = (result: { id: string; label: string } | null) => {
        done(result);
      };

      const makeSelectList = () => {
        const list = new SelectList(
          items,
          Math.min(items.length, 20),
          overlaySelectListTheme(theme),
        );
        list.onSelect = (item) =>
          finish(
            item.value === "__none__"
              ? null
              : { id: item.value, label: item.label },
          );
        list.onCancel = () => finish(null);
        return list;
      };

      let selectList = makeSelectList();

      const renderList = (innerWidth: number): string[] => {
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
            theme.fg(
              "dim",
              "↑↓ navigate · enter activate · →/tab detail · esc cancel",
            ),
            innerWidth,
          ),
        );
        lines.push(border(`╰${"─".repeat(innerWidth)}╯`));
        return lines;
      };

      const renderDetail = (innerWidth: number): string[] => {
        const lines: string[] = [];
        lines.push(border(`╭${"─".repeat(innerWidth)}╮`));
        lines.push(
          wrapRow(
            theme.fg(
              "accent",
              theme.bold(`Segment detail: ${detailId ?? ""}`),
            ),
            innerWidth,
          ),
        );
        lines.push(border(`├${"─".repeat(innerWidth)}┤`));
        const labelWidth = detailLines.reduce(
          (max, line) => Math.max(max, line.label.length),
          0,
        );
        for (const line of detailLines) {
          lines.push(
            wrapRow(
              `  ${line.label.padEnd(labelWidth)}  ${line.value}`,
              innerWidth,
            ),
          );
        }
        lines.push(border(`├${"─".repeat(innerWidth)}┤`));
        lines.push(
          wrapRow(
            theme.fg("dim", "← back · enter copy · esc close"),
            innerWidth,
          ),
        );
        lines.push(border(`╰${"─".repeat(innerWidth)}╯`));
        return lines;
      };

      return {
        render: (width: number) => {
          const innerWidth = Math.max(1, width - 2);
          return detailId
            ? renderDetail(innerWidth)
            : renderList(innerWidth);
        },
        invalidate: () => selectList.invalidate(),
        handleInput: (data: string) => {
          if (detailId !== null) {
            if (
              matchesKey(data, "left") ||
              matchesKey(data, "escape") ||
              matchesKey(data, "backspace")
            ) {
              detailId = null;
            } else if (matchesKey(data, "enter")) {
              const summary = detailLines
                .map((line) => `${line.label}: ${line.value}`)
                .join("  ·  ");
              ctx.ui.notify(`${detailId}: ${summary}`, "info");
              finish(null);
              return;
            }
            tui.requestRender();
            return;
          }

          if (matchesKey(data, "right") || matchesKey(data, "tab")) {
            const selected = selectList.getSelectedItem();
            if (selected && selected.value !== "__none__") {
              openDetail(selected.value);
              tui.requestRender();
              return;
            }
          }

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
