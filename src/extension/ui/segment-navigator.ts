import {
  copyToClipboard,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import { matchesKey, SelectList, truncateToWidth } from "@earendil-works/pi-tui";

import type { StatusLineSegmentId } from "../../config/types.ts";
import { listOpenPortProcesses } from "../../segments/system.ts";
import { buildSegmentContext } from "../core/segment-context.ts";
import { config } from "../core/state.ts";
import type { RuntimeState } from "../core/types.ts";
import {
  buildSegmentDetailLines,
  buildSegmentItems,
  segmentItemsToSelectItems,
} from "./menu-items.ts";
import { overlaySelectListTheme } from "./overlay-chrome.ts";
import { showOpenPortsList } from "./open-ports-view.ts";
import { showTpsOverlay } from "./token-overlays.ts";

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
  // Strip the status bullet and the segment id so the notification shows
  // "git: main" instead of "git: git  main".
  const value = picked.label.replace(/^●\s*/, "").replace(/^\S+\s+/, "");
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
              // Capture the id before the async chain: the user can return
              // to the list (detailId -> null) while the copy is in flight.
              const copiedId = detailId;
              copyToClipboard(summary)
                .then(() => {
                  ctx.ui.notify(`${copiedId} copied to clipboard`, "info");
                })
                .catch(() => {
                  ctx.ui.notify(`${copiedId}: ${summary}`, "info");
                })
                .finally(() => finish(null));
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
