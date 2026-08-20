import { visibleWidth } from "@earendil-works/pi-tui";
import { ansi, fgOnly, getFgAnsiCode } from "../theme/colors.ts";
import { centerText, fitToWidth, getBoxLayout } from "./layout.ts";
import type { WelcomeData, WelcomeWidget, WidgetRenderContext } from "./types.ts";

import { QueueWidget } from "./widgets/queue-widget.ts";
import { SessionsWidget } from "./widgets/sessions-widget.ts";
import { ShortcutsWidget } from "./widgets/shortcuts-widget.ts";
import { SystemWidget } from "./widgets/system-widget.ts";
import { WhatsNewWidget } from "./widgets/whats-new-widget.ts";

const PI_LOGO = [
  "     . *      ",
  "   * ╭───╮ .  ",
  "  .  │   │  * ",
  "     │   │    ",
  "   * ╰─┬─╯ .  ",
  "  .    ┴      ",
];

const GRADIENT_COLORS = [
  "\x1b[38;5;199m",
  "\x1b[38;5;171m",
  "\x1b[38;5;135m",
  "\x1b[38;5;99m",
  "\x1b[38;5;75m",
  "\x1b[38;5;51m",
];

function bold(text: string): string {
  return `\x1b[1m${text}\x1b[22m`;
}

export function dim(text: string): string {
  return getFgAnsiCode("sep") + text + ansi.reset;
}

function gradientLine(line: string): string {
  const reset = ansi.reset;
  let result = "";
  let colorIdx = 0;
  const step = Math.max(1, Math.floor(line.length / GRADIENT_COLORS.length));

  for (let i = 0; i < line.length; i++) {
    if (i > 0 && i % step === 0 && colorIdx < GRADIENT_COLORS.length - 1)
      colorIdx++;
    const char = line[i];
    if (char !== " ") {
      result += GRADIENT_COLORS[colorIdx] + char + reset;
    } else {
      result += char;
    }
  }
  return result;
}

function buildLeftColumn(ctx: WidgetRenderContext): string[] {
  const logoColored = PI_LOGO.map((line) => gradientLine(line));

  return [
    "",
    ...logoColored.map((l) => centerText(l, ctx.width)),
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

  const renderedWidgets: string[][] = [];
  for (const widget of widgets) {
    const wLines = widget.render(ctx);
    if (wLines.length > 0) {
      renderedWidgets.push(wLines);
    }
  }

  for (let i = 0; i < renderedWidgets.length; i++) {
    lines.push(...renderedWidgets[i]);
    if (i < renderedWidgets.length - 1) {
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
    WhatsNewWidget,
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
