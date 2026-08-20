import { copyToClipboard } from "@earendil-works/pi-coding-agent";
import type { SelectItem } from "@earendil-works/pi-tui";

import { getPreset } from "../../config/presets.ts";
import {
  mergeSegmentsWithCustomItems,
  type PowerlineConfig,
} from "../../config/powerline-config.ts";
import type { StatusLineSegmentId } from "../../config/types.ts";
import { config } from "../core/state.ts";
import { showSelectOverlay } from "../ui/menu-views.ts";

/**
 * A settings-ready snapshot of the currently rendered powerline look. Pasted
 * under `powerline` it reproduces the same preset + effective layout + labels
 * (disabled segments are already filtered out of the layout groups).
 */
export interface PowerlineExportSnippet {
  preset: string;
  /** Included only when the user explicitly overrode the preset separator. */
  separator?: string;
  layout: {
    left: StatusLineSegmentId[];
    right: StatusLineSegmentId[];
    secondary?: StatusLineSegmentId[];
  };
  /** Included only when at least one label is configured. */
  segmentLabels?: Record<string, string>;
}

/** Resolve the effective segment layout for the current config (pure). */
export function buildPowerlineExportSnippet(
  cfg: PowerlineConfig,
): PowerlineExportSnippet {
  const presetDef = getPreset(cfg.preset);
  const merged = mergeSegmentsWithCustomItems(presetDef, cfg.customItems, {
    layout: cfg.layout,
    disabledSegments: cfg.disabledSegments,
  });

  const layout: PowerlineExportSnippet["layout"] = {
    left: [...merged.leftSegments],
    right: [...merged.rightSegments],
  };
  if (merged.secondarySegments.length > 0) {
    layout.secondary = [...merged.secondarySegments];
  }

  const snippet: PowerlineExportSnippet = { preset: cfg.preset, layout };
  if (cfg.separator) snippet.separator = cfg.separator;
  if (Object.keys(cfg.segmentLabels).length > 0) {
    snippet.segmentLabels = { ...cfg.segmentLabels };
  }
  return snippet;
}

/** Pretty-print the export as the JSON users paste into settings.json. */
export function formatPowerlineExport(snippet: PowerlineExportSnippet): string {
  return JSON.stringify(snippet, null, 2);
}

/** Review the export in a scrollable overlay; Enter copies the full snippet. */
export async function runPowerlineExport(ctx: any): Promise<void> {
  const snippet = buildPowerlineExportSnippet(config);
  const json = formatPowerlineExport(snippet);
  const lines = json.split("\n");
  const items: SelectItem[] = lines.map((line) => ({
    label: line,
    value: line,
  }));

  const picked = await showSelectOverlay(
    ctx,
    "Powerline export",
    "↑↓ scroll · enter copy full snippet · esc close",
    items,
    Math.min(items.length, 24),
  );
  if (!picked) return;

  let copied = false;
  try {
    await copyToClipboard(json);
    copied = true;
  } catch {
    copied = false;
  }
  ctx.ui.notify(
    copied
      ? "Powerline config copied to clipboard"
      : "Could not copy to clipboard; the snippet is shown above",
    copied ? "info" : "warning",
  );
}
