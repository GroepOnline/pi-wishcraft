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
    for (const entry of entries) {
      lines.push(` ${dim("• ")}${entry}`);
    }
    return lines;
  },
};
