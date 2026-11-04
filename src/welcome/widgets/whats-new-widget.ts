import { wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { tr } from "../../i18n/index.ts";
import type { WelcomeWidget, WidgetRenderContext } from "../types.ts";

export const WhatsNewWidget: WelcomeWidget = {
  id: "whats-new",
  render(ctx: WidgetRenderContext): string[] {
    const { data, dim, bold, color } = ctx;
    const entries = data.whatsNew ?? [];
    if (entries.length === 0) {
      return [];
    }

    const title =
      data.whatsNewTitle ??
      tr("welcome.whatsNew", "What's new");

    const lines: string[] = [];
    lines.push(` ${bold(color("accent", title))}`);
    const selected =
      data.focus?.section === "news"
        ? data.focus.index
        : (data.whatsNewSelected ?? null);
    entries.forEach((entry, index) => {
      if (selected !== index) {
        lines.push(` ${dim("• ")}${entry}`);
        return;
      }
      // Expanded: wrap instead of letting the column truncate the bullet.
      const wrapped = wrapTextWithAnsi(entry, Math.max(12, ctx.width - 4));
      wrapped.forEach((line, row) => {
        lines.push(row === 0 ? ` ${color("accent", "▸ ")}${line}` : `   ${line}`);
      });
    });
    return lines;
  },
};
