import { tr } from "../../i18n/index.ts";
import type { WelcomeWidget, WidgetRenderContext } from "../types.ts";
import { quickLaunchItems } from "../quick-launch.ts";

const KEYS_WIDTH = 10;

export const ShortcutsWidget: WelcomeWidget = {
  id: "shortcuts",
  render(ctx: WidgetRenderContext): string[] {
    const { data, dim, bold, color } = ctx;
    const lines: string[] = [];
    const focused =
      data.focus?.section === "shortcuts" ? data.focus.index : null;

    lines.push(` ${bold(color("accent", tr("welcome.shortcuts", "Quick Launch / Tactical")))}`);

    quickLaunchItems().forEach((item, index) => {
      const marker = focused === index ? color("accent", "▸") : " ";
      const keys = item.keys.padEnd(KEYS_WIDTH);
      const keysStyled = focused === index ? color("accent", keys) : dim(keys);
      lines.push(`${marker}${keysStyled} ${item.label}`);
    });

    return lines;
  },
};
