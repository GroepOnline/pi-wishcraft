import type { SelectItem } from "@earendil-works/pi-tui";

import type { PowerlineConfig } from "../../config/powerline-config.ts";
import { mergeSegmentsWithCustomItems } from "../../config/powerline-config.ts";
import { getPreset } from "../../config/presets.ts";
import {
  BUILTIN_STATUS_LINE_SEGMENT_IDS,
  type CustomPresetConfig,
  type CustomStatusItem,
  type PresetDef,
  type SegmentContext,
  type StatusLineSegmentId,
  type StatusLineSeparatorStyle,
} from "../../config/types.ts";
import type { OpenPortProcess } from "../../segments/system.ts";
import { formatUsdCost } from "../../usage/rates.ts";
import { renderSegmentWithWidth } from "./layout.ts";

const stripAnsi = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, "");

export interface SegmentMenuItem {
  id: StatusLineSegmentId;
  /** ANSI-stripped rendered value shown next to the id in the navigator. */
  value: string;
}

export interface DetailLine {
  label: string;
  value: string;
}

/**
 * Segment ids in the active preset/layout order (custom items merged in).
 * Disabled segments are intentionally kept so the toggle view can re-enable
 * them; callers that render the live bar must filter those themselves.
 */
export function collectSegmentIds(
  config: PowerlineConfig,
  customItems: readonly CustomStatusItem[] = config.customItems,
): StatusLineSegmentId[] {
  const presetDef = getPreset(config.preset);
  const merged = mergeSegmentsWithCustomItems(presetDef, customItems, {
    layout: config.layout,
  });
  return [
    ...merged.leftSegments,
    ...merged.rightSegments,
    ...merged.secondarySegments,
  ];
}

/**
 * Build navigator entries from the live segment context. Pure: given the same
 * context + config it returns the same items, so it can be unit-tested.
 * Disabled and currently-hidden segments are skipped (the bar never shows
 * them, so there is nothing to navigate into).
 */
export function buildSegmentItems(
  segCtx: SegmentContext,
  config: PowerlineConfig,
): SegmentMenuItem[] {
  const disabled = new Set(config.disabledSegments);
  const items: SegmentMenuItem[] = [];
  for (const id of collectSegmentIds(config, segCtx.effectiveCustomItems)) {
    if (disabled.has(id)) continue;
    const rendered = renderSegmentWithWidth(id, segCtx);
    if (!rendered.visible) continue;
    const value = stripAnsi(rendered.content).trim() || "(empty)";
    items.push({ id, value });
  }
  return items;
}

export function segmentItemsToSelectItems(
  items: SegmentMenuItem[],
): SelectItem[] {
  const selectItems: SelectItem[] = items.map((item) => ({
    label: `● ${item.id}  ${item.value}`,
    value: item.id,
  }));
  if (selectItems.length === 0) {
    selectItems.push({ label: "(no visible segments)", value: "__none__" });
  }
  return selectItems;
}

/**
 * Index into `items` to keep the selection stable across a live refresh. The
 * navigator rebuilds its item list on a timer; restoring by segment id (value)
 * keeps the highlight on the same segment even when labels shift. Falls back to
 * the first item when the previous selection no longer exists.
 */
export function selectIndexForValue(
  items: SelectItem[],
  previousValue: string | null,
): number {
  if (previousValue === null) return 0;
  const index = items.findIndex((item) => item.value === previousValue);
  return index >= 0 ? index : 0;
}

/** Configure sub-menu choices as plain data (label only; order is the menu). */
export function buildConfigureItems(): string[] {
  return [
    "Open full settings (/wishcraft)…",
    "Change preset",
    "Set TPS value (POWERLINE_TPS)",
    "Clear TPS override (use live)",
    "Toggle UDP in open-ports",
    "Toggle segment visibility…",
    "Set segment label…",
    "Build custom preset…",
    "Show current config",
  ];
}

const CONFIGURE_ITEM_DESCRIPTIONS: Record<string, string> = {
  "Open full settings (/wishcraft)…": "All wishcraft settings: status bar, welcome art, hooks, shortcuts",
  "Change preset": "Switch left/right segment layout preset",
  "Set TPS value (POWERLINE_TPS)": "Override tokens/sec display with a fixed value",
  "Clear TPS override (use live)": "Remove POWERLINE_TPS and use the live rate",
  "Toggle UDP in open-ports": "Include or exclude UDP listeners in the port count",
  "Toggle segment visibility…": "Enable or disable individual segments",
  "Set segment label…": "Override the label prefix for one segment",
  "Build custom preset…": "Compose a new preset from segment groups",
  "Show current config": "Notify a one-line summary of active settings",
};

/** Configure sub-menu as SelectList items (CHE-42 overlay). */
export function configureItemsToSelectItems(): SelectItem[] {
  return buildConfigureItems().map((label) => ({
    label,
    value: label,
    description: CONFIGURE_ITEM_DESCRIPTIONS[label],
  }));
}

/**
 * Every segment id a user can place while building a custom preset: built-ins
 * plus `custom:<id>` for explicit custom items and user-defined computed
 * segments (command/env/static).
 */
export function buildCustomPresetSegmentIds(
  config: PowerlineConfig,
): StatusLineSegmentId[] {
  const ids: StatusLineSegmentId[] = [...BUILTIN_STATUS_LINE_SEGMENT_IDS];
  const seen = new Set<string>(ids);
  for (const item of config.customItems) {
    const id = `custom:${item.id}` as StatusLineSegmentId;
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  for (const id of Object.keys(config.segments)) {
    const segmentId = `custom:${id}` as StatusLineSegmentId;
    if (!seen.has(segmentId)) {
      seen.add(segmentId);
      ids.push(segmentId);
    }
  }
  return ids;
}

/** Normalize a user-entered preset name to a lowercase safe id, or null. */
export function validatePresetName(name: string): string | null {
  const trimmed = name.trim().toLowerCase();
  return /^[a-z0-9_-]+$/.test(trimmed) && trimmed.length > 0 ? trimmed : null;
}

/**
 * Choices for one "add segment to this preset group" picker: a done sentinel
 * first, then every not-yet-chosen id. Pure so the picker can be unit-tested.
 */
export function buildPresetEditorAddItems(
  all: readonly StatusLineSegmentId[],
  chosen: readonly StatusLineSegmentId[],
): SelectItem[] {
  const chosenSet = new Set(chosen);
  const items: SelectItem[] = [
    {
      label:
        chosen.length > 0 ? `— done — (${chosen.length} selected)` : "— done —",
      value: "__done__",
    },
  ];
  for (const id of all) {
    if (chosenSet.has(id)) continue;
    items.push({ label: `+ ${id}`, value: id });
  }
  return items;
}

/**
 * Assemble a `CustomPresetConfig` from a base preset (colors + segment options
 * are inherited) plus the user's chosen segment groups and separator.
 */
export function buildCustomPresetDef(
  base: PresetDef,
  left: readonly StatusLineSegmentId[],
  right: readonly StatusLineSegmentId[],
  secondary: readonly StatusLineSegmentId[],
  separator: StatusLineSeparatorStyle,
): CustomPresetConfig {
  const def: CustomPresetConfig = {
    left: [...left],
    right: [...right],
    separator,
  };
  if (secondary.length > 0) def.secondary = [...secondary];
  if (base.colors) def.colors = { ...base.colors };
  if (base.segmentOptions) def.segmentOptions = { ...base.segmentOptions };
  return def;
}

/**
 * Key/value detail rows for the per-segment detail view (`→`/`tab`).
 * `openPortProcesses` is the live (already cached) `listOpenPortProcesses()`
 * result, passed in so this builder stays pure and unit-testable.
 */
export function buildSegmentDetailLines(
  id: StatusLineSegmentId,
  segCtx: SegmentContext,
  openPortProcesses: readonly OpenPortProcess[] = [],
): DetailLine[] {
  const usage = segCtx.usageStats;
  const label = segCtx.segmentLabels.get(id);
  const common: DetailLine[] = [{ label: "segment", value: id }];
  if (label) common.push({ label: "label", value: label });

  switch (id) {
    case "tps": {
      const override = process.env.POWERLINE_TPS;
      const windowMs = segCtx.options.tps?.windowMs;
      const lines: DetailLine[] = [
        ...common,
        {
          label: "value",
          value: override ? `${override} (override)` : "live 1s window",
        },
      ];
      if (windowMs) lines.push({ label: "window", value: `${windowMs} ms` });
      return lines;
    }
    case "open_ports": {
      const host = segCtx.options.openPorts?.host;
      const lines: DetailLine[] = [
        ...common,
        {
          label: "UDP",
          value: segCtx.options.openPorts?.includeUdp ? "on" : "off",
        },
      ];
      if (host) lines.push({ label: "host", value: host });
      if (openPortProcesses.length > 0) {
        for (const p of openPortProcesses) {
          lines.push({
            label: `${p.proto}:${p.port}`,
            value: p.process ?? "(unknown)",
          });
        }
      } else {
        lines.push({ label: "processes", value: "(none / ss -p unavailable)" });
      }
      return lines;
    }
    case "git": {
      const git = segCtx.git;
      const lines: DetailLine[] = [...common];
      if (git.branch) {
        lines.push({ label: "branch", value: git.branch });
        lines.push({
          label: "changes",
          value: `+${git.staged} ~${git.unstaged} ?${git.untracked}`,
        });
        lines.push({
          label: "upstream",
          value: `↑${git.ahead} ↓${git.behind}`,
        });
        if (git.commit) {
          lines.push({
            label: "head",
            value: `${git.commit.short} ${git.commit.subject}`,
          });
        }
      } else {
        lines.push({ label: "branch", value: "(no repo)" });
      }
      return lines;
    }
    case "cost": {
      const currency = segCtx.options.cost?.currency ?? "USD";
      const total = usage.cost + usage.subagentCost;
      return [
        ...common,
        {
          label: "cost",
          value: formatUsdCost(usage.cost, currency) ?? `$${usage.cost.toFixed(2)}`,
        },
        {
          label: "subagents",
          value:
            formatUsdCost(usage.subagentCost, currency) ??
            `$${usage.subagentCost.toFixed(2)}`,
        },
        {
          label: "total",
          value: formatUsdCost(total, currency) ?? `$${total.toFixed(2)}`,
        },
      ];
    }
    case "context_pct":
    case "context_total":
      return [
        ...common,
        { label: "tokens", value: String(segCtx.contextTokens) },
        { label: "window", value: String(segCtx.contextWindow) },
        { label: "percent", value: `${segCtx.contextPercent.toFixed(1)}%` },
        {
          label: "auto-compact",
          value: segCtx.autoCompactEnabled ? "on" : "off",
        },
      ];
    case "model":
      return [
        ...common,
        {
          label: "model",
          value: segCtx.model?.name ?? segCtx.model?.id ?? "(unknown)",
        },
        { label: "thinking", value: segCtx.thinkingLevel },
      ];
    case "queue": {
      const queue = segCtx.queueSummary;
      const lines: DetailLine[] = [
        ...common,
        { label: "queued", value: String(queue.queueCount) },
        { label: "ideas", value: String(queue.ideaCount) },
        { label: "blocked", value: String(queue.blockedCount) },
      ];
      if (queue.leadingText) lines.push({ label: "next", value: queue.leadingText });
      return lines;
    }
    case "token_in":
      return [...common, { label: "input", value: String(usage.input) }];
    case "token_out":
      return [...common, { label: "output", value: String(usage.output) }];
    case "token_total":
      return [
        ...common,
        {
          label: "total",
          value: String(
            usage.input + usage.output + usage.cacheRead + usage.cacheWrite,
          ),
        },
      ];
    case "cache_read":
      return [...common, { label: "cache read", value: String(usage.cacheRead) }];
    case "cache_write":
      return [
        ...common,
        { label: "cache write", value: String(usage.cacheWrite) },
      ];
    case "time_spent":
      return [
        ...common,
        {
          label: "session start",
          value: new Date(segCtx.sessionStartTime).toLocaleTimeString(),
        },
      ];
    default: {
      const rendered = renderSegmentWithWidth(id, segCtx);
      const value = rendered.visible
        ? stripAnsi(rendered.content).trim() || "(empty)"
        : "(hidden)";
      return [...common, { label: "value", value }];
    }
  }
}
