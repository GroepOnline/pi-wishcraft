import { visibleWidth } from "@earendil-works/pi-tui";
import { ansi, fgOnly, getFgAnsiCode } from "../theme/colors.ts";
import { centerText, fitToWidth, getBoxLayout } from "./layout.ts";
import type { WelcomeData, WelcomeWidget, WidgetRenderContext } from "./types.ts";
import { renderLantern } from "./lantern.ts";

import { QueueWidget } from "./widgets/queue-widget.ts";
import { SessionsWidget } from "./widgets/sessions-widget.ts";
import { ShortcutsWidget } from "./widgets/shortcuts-widget.ts";
import { SystemWidget } from "./widgets/system-widget.ts";

function bold(text: string): string {
  return `\x1b[1m${text}\x1b[22m`;
}

export function dim(text: string): string {
  return getFgAnsiCode("sep") + text + ansi.reset;
}

function buildLeftColumn(ctx: WidgetRenderContext): string[] {
  const lantern = renderLantern(
    { now: Date.now(), still: ctx.data.quietStartup },
    ctx.width,
  );

  return [
    "",
    ...lantern.map((l) => centerText(l, ctx.width)),
    "",
    centerText(fgOnly("model", ctx.data.modelName), ctx.width),
    centerText(dim(ctx.data.providerName), ctx.width),
  ];
}

function buildRightColumn(
  ctx: WidgetRenderContext,
  widgets: WelcomeWidget[]
): string[] {
  const hChar = "─";
  const separator = ` ${dim(hChar.repeat(Math.max(1, ctx.width - 2)))}`;
  const lines: string[] = [];

  lines.push(` ${bold(fgOnly("accent", "Signals & Wishes"))}`);
  lines.push(` ${dim("Write it down, let it rise, keep your focus clear.")}`);
  lines.push(separator);

  for (let i = 0; i < widgets.length; i++) {
    const wLines = widgets[i].render(ctx);
    lines.push(...wLines);
    if (i < widgets.length - 1) {
      lines.push(separator);
    }
  }

  lines.push("");
  return lines;
}

export function renderWelcomeBox(
  data: WelcomeData,
  termWidth: number,
  bottomLine: string,
): string[] {
  const layout = getBoxLayout(termWidth);
  if (!layout) {
    return [];
  }

  const { boxWidth, leftCol, rightCol } = layout;

  const hChar = "─";
  const v = dim("│");
  const tl = dim("╭");
  const tr = dim("╮");
  const bl = dim("╰");
  const br = dim("╯");

  const rightWidgets = [
    SystemWidget,
    QueueWidget,
    ShortcutsWidget,
    SessionsWidget,
  ];

  const leftCtx: WidgetRenderContext = {
    data,
    width: leftCol,
    dim,
    bold,
    color: fgOnly,
  };

  const rightCtx: WidgetRenderContext = {
    data,
    width: rightCol,
    dim,
    bold,
    color: fgOnly,
  };

  const leftLines = buildLeftColumn(leftCtx);
  const rightLines = buildRightColumn(rightCtx, rightWidgets);

  const lines: string[] = [];

  const title = " pi-wishcraft ";
  const titlePrefix = dim(hChar.repeat(3));
  const titleStyled = titlePrefix + fgOnly("model", title);
  const titleVisLen = 3 + visibleWidth(title);
  const afterTitle = boxWidth - 2 - titleVisLen;
  const afterTitleText = afterTitle > 0 ? dim(hChar.repeat(afterTitle)) : "";
  lines.push(tl + titleStyled + afterTitleText + tr);

  const maxRows = Math.max(leftLines.length, rightLines.length);
  for (let i = 0; i < maxRows; i++) {
    const left = fitToWidth(leftLines[i] ?? "", leftCol);
    const right = fitToWidth(rightLines[i] ?? "", rightCol);
    lines.push(v + left + v + right + v);
  }

  lines.push(bl + bottomLine + br);

  return lines;
}
