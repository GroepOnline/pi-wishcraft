/**
 * RPC surface for the powerline. In `pi --mode rpc` `ctx.ui.setWidget`
 * ignores component factories — only the `string[]` form crosses the JSONL
 * wire as `extension_ui_request` records. This adapter renders the same line
 * producers the TUI widgets use and pushes the results as widget lines,
 * refreshed on the same cadence as a TUI repaint.
 *
 * The TUI footer also hands the extension a ReadonlyFooterDataProvider —
 * git branch, extension statuses, branch-change events. In rpc mode the
 * host never builds a footer, so `rt.footerDataRef` stays null and every
 * consumer would render empty. We therefore install our own provider: the
 * branch comes from the shared git-status cache, statuses are mirrored
 * through a wrapped `ctx.ui.setStatus`, and branch changes bridge onto the
 * git-update bus like the footer does.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import type { ReadonlyFooterDataProvider } from "@earendil-works/pi-coding-agent";

import { getCurrentBranch, subscribeGitUpdates } from "../../git/status.ts";
import { subscribePortsUpdates } from "../../segments/ports.ts";
import { subscribeCustomSegmentUpdates } from "../../segments/custom.ts";
import { debugLog } from "../core/debug-log.ts";
import { requestStatusRender } from "../core/segment-context.ts";
import { config } from "../core/state.ts";
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

interface RpcUi {
  theme: Theme;
  setWidget(
    key: string,
    lines: string[],
    options?: { placement?: "aboveEditor" | "belowEditor" },
  ): void;
  setStatus(key: string, text: string | undefined): void;
}

interface RpcCtx {
  ui: RpcUi;
}

type WidgetRenderer = (rt: RuntimeState, width: number, theme: Theme) => string[];

function rpcWidgets(): Readonly<
  {
    key: string;
    placement: "aboveEditor" | "belowEditor";
    render: WidgetRenderer;
  }[]
> {
  return [
    {
      key: "powerline-status",
      placement: "aboveEditor",
      render: (rt, width) => renderPowerlineStatusLines(rt, width),
    },
    {
      key: "powerline-top",
      placement: config.placement === "below" ? "belowEditor" : "aboveEditor",
      render: (rt, width, theme) => renderPowerlinePrimaryLines(rt, width, theme),
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
}

function widgetWidth(): number {
  const columns = process.stdout.columns;
  return typeof columns === "number" && columns > 0 ? columns : RPC_WIDGET_WIDTH;
}

let disposeSessionResources: (() => void) | null = null;

/**
 * Register every powerline widget in its `string[]` form and keep the lines
 * current via `rt.rpcWidgetRefresh`, driven by the status render scheduler
 * plus the same async-segment subscriptions the TUI footer installs.
 */
export function installRpcWidgets(rt: RuntimeState, ctx: RpcCtx): void {
  disposeSessionResources?.();

  // Mirror setStatus so segments/status lines can read extension statuses in
  // rpc — the host keeps them on its own (unreachable) footer provider.
  const statusMirror = new Map<string, string>();
  const originalSetStatus = ctx.ui.setStatus.bind(ctx.ui);
  ctx.ui.setStatus = (key, text) => {
    if (text === undefined) {
      statusMirror.delete(key);
    } else {
      statusMirror.set(key, text);
    }
    originalSetStatus(key, text);
  };
  const restoreSetStatus = () => {
    ctx.ui.setStatus = originalSetStatus;
  };

  const provider: ReadonlyFooterDataProvider = {
    getGitBranch: () => getCurrentBranch(null),
    getExtensionStatuses: () => statusMirror,
    getAvailableProviderCount: () => 0,
    onBranchChange: (callback) => subscribeGitUpdates(callback),
  };
  rt.footerDataRef = provider;

  const unsubs = [
    subscribeGitUpdates(() => requestStatusRender(rt)),
    subscribePortsUpdates(() => requestStatusRender(rt)),
    subscribeCustomSegmentUpdates(() => requestStatusRender(rt)),
  ];

  const theme = ctx.ui.theme;
  const push = () => {
    if (rt.currentCtx == null) return;
    const width = widgetWidth();
    for (const widget of rpcWidgets()) {
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
    // Invalidate the composed line only — wiping the session caches per tick
    // would rebuild git/token stats on every refresh.
    rt.lastLayoutResult = null;
    rt.layoutDirty = true;
    push();
  };

  disposeSessionResources = () => {
    for (const unsub of unsubs) unsub();
    restoreSetStatus();
    rt.rpcWidgetRefresh = null;
    if (rt.footerDataRef === provider) rt.footerDataRef = null;
    disposeSessionResources = null;
  };

  push();
}

/** Drop the rpc provider, subscriptions and the status mirror. */
export function disposeRpcWidgets(): void {
  disposeSessionResources?.();
}
