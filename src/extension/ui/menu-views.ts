import type { SelectItem } from "@earendil-works/pi-tui";

import type {
  StatusLinePreset,
  StatusLineSegmentId,
  StatusLineSeparatorStyle,
} from "../../config/types.ts";
import { getPreset, PRESETS, registerCustomPresets } from "../../config/presets.ts";
import { SEPARATOR_STYLES } from "../../config/primitives.ts";
import { countListeningPorts } from "../../segments/system.ts";
import {
  writePowerlineCustomPresetSetting,
  writePowerlineOptionSetting,
  writePowerlinePresetSetting,
} from "../settings/settings-io.ts";
import {
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
  collectSegmentIds,
  configureItemsToSelectItems,
  validatePresetName,
} from "./menu-items.ts";
import { showSelectOverlay } from "./overlay-chrome.ts";
import { showWishcraftConfig } from "../settings/wishcraft-config.ts";

export { overlaySelectListTheme, showSelectOverlay } from "./overlay-chrome.ts";
export { showOpenPortsList } from "./open-ports-view.ts";
export { activateSegment, showSegmentNavigator } from "./segment-navigator.ts";

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
