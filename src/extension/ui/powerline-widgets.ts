import type { Theme } from "@earendil-works/pi-coding-agent";

import {
  resetLayoutCache,
  requestStatusRender,
} from "../core/segment-context.ts";
import {
  renderBashTranscriptLines,
  renderLastPromptLines,
  renderPowerlinePrimaryLines,
  renderPowerlineQueuePreviewLines,
  renderPowerlineSecondaryLines,
  renderPowerlineStatusLines,
} from "./status-line-renderers.ts";
import { config } from "../core/state.ts";
import type { RuntimeState } from "../core/types.ts";

export function installPowerlineWidgets(rt: RuntimeState, ctx: any) {
  ctx.ui.setWidget(
    "powerline-status",
    () => ({
      dispose() {},
      invalidate() {
        requestStatusRender(rt);
      },
      render(width: number): string[] {
        return renderPowerlineStatusLines(rt, width);
      },
    }),
    { placement: "aboveEditor" },
  );

  ctx.ui.setWidget(
    "powerline-top",
    (_tui: any, theme: Theme) => ({
      dispose() {},
      invalidate() {
        resetLayoutCache(rt);
      },
      render(width: number): string[] {
        return renderPowerlinePrimaryLines(rt, width, theme);
      },
    }),
    {
      placement: config.placement === "below" ? "belowEditor" : "aboveEditor",
    },
  );

  ctx.ui.setWidget(
    "powerline-secondary",
    (_tui: any, theme: Theme) => ({
      dispose() {},
      invalidate() {
        resetLayoutCache(rt);
      },
      render(width: number): string[] {
        return renderPowerlineSecondaryLines(rt, width, theme);
      },
    }),
    { placement: "belowEditor" },
  );

  ctx.ui.setWidget(
    "powerline-bash-transcript",
    (_tui: any, theme: Theme) => ({
      dispose() {},
      invalidate() {},
      render(width: number): string[] {
        return renderBashTranscriptLines(rt, width, theme);
      },
    }),
    { placement: "belowEditor" },
  );

  ctx.ui.setWidget(
    "powerline-queue-preview",
    (_tui: any, theme: Theme) => ({
      dispose() {},
      invalidate() {},
      render(width: number): string[] {
        return renderPowerlineQueuePreviewLines(rt, width, theme);
      },
    }),
    { placement: "belowEditor" },
  );

  ctx.ui.setWidget(
    "powerline-last-prompt",
    () => ({
      dispose() {},
      invalidate() {},
      render(width: number): string[] {
        return renderLastPromptLines(rt, width);
      },
    }),
    { placement: "belowEditor" },
  );
}
