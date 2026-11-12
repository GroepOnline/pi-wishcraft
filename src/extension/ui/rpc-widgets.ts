/**
 * RPC surface for the powerline. In `pi --mode rpc` `ctx.ui.setWidget`
 * ignores component factories — only the `string[]` form crosses the JSONL
 * wire as `extension_ui_request` records. This adapter renders the same line
 * producers the TUI widgets use and pushes the results as widget lines,
 * refreshed on the same cadence as a TUI repaint.
 */

import { debugLog } from "../core/debug-log.ts";
import { resetLayoutCache } from "../core/segment-context.ts";
import type { RuntimeState } from "../core/types.ts";
import {
  renderBashTranscriptLines,
  renderLastPromptLines,
  renderPowerlinePrimaryLines,
  renderPowerlineQueuePreviewLines,
  renderPowerlineSecondaryLines,
  renderPowerlineStatusLines,
} from "./status-line-renderers.ts";

/** rpc hosts have no tty; pick a stable line width for the exported lines. */
const RPC_WIDGET_WIDTH = 80;

type WidgetRenderer = (rt: RuntimeState, width: number, theme: any) => string[];

const RPC_WIDGETS: ReadonlyArray<{
  key: string;
  placement: "aboveEditor" | "belowEditor";
  render: WidgetRenderer;
}> = [
  {
    key: "powerline-status",
    placement: "aboveEditor",
    render: (rt, width) => renderPowerlineStatusLines(rt, width),
  },
  {
    key: "powerline-top",
    placement: "aboveEditor",
    render: (rt, width, theme) =>
      renderPowerlinePrimaryLines(rt, width, theme),
  },
  {
    key: "powerline-secondary",
    placement: "belowEditor",
    render: (rt, width, theme) =>
      renderPowerlineSecondaryLines(rt, width, theme),
  },
  {
    key: "powerline-bash-transcript",
    placement: "belowEditor",
    render: (rt, width, theme) =>
      renderBashTranscriptLines(rt, width, theme),
  },
  {
    key: "powerline-queue-preview",
    placement: "belowEditor",
    render: (rt, width, theme) =>
      renderPowerlineQueuePreviewLines(rt, width, theme),
  },
  {
    key: "powerline-last-prompt",
    placement: "belowEditor",
    render: (rt, width) => renderLastPromptLines(rt, width),
  },
];

function widgetWidth(): number {
  const columns = process.stdout.columns;
  return typeof columns === "number" && columns > 0 ? columns : RPC_WIDGET_WIDTH;
}

/**
 * Register every powerline widget in its `string[]` form and keep the lines
 * current via `rt.rpcWidgetRefresh`, driven by the status render scheduler.
 */
export function installRpcWidgets(rt: RuntimeState, ctx: any): void {
  const theme = ctx?.ui?.theme;
  const push = () => {
    if (rt.currentCtx == null) return;
    const width = widgetWidth();
    for (const widget of RPC_WIDGETS) {
      try {
        ctx.ui.setWidget(widget.key, widget.render(rt, width, theme), {
          placement: widget.placement,
        });
      } catch (error) {
        debugLog(`[wishcraft] rpc widget ${widget.key} failed:`, error);
      }
    }
  };

  rt.rpcWidgetRefresh = () => {
    resetLayoutCache(rt);
    push();
  };
  push();
}
