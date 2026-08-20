import type { WelcomeWidget, WidgetRenderContext } from "../types.ts";

export const WhatsNewWidget: WelcomeWidget = {
  id: "whats-new",
  render(ctx: WidgetRenderContext): string[] {
    const { data, dim, bold, color } = ctx;
    const entries = data.whatsNew ?? [];
    if (entries.length === 0) {
      return [];
    }

    const lines: string[] = [];
    lines.push(` ${bold(color("accent", "What's new"))}`);
    for (const entry of entries) {
      lines.push(` ${dim("• ")}${entry}`);
    }
    return lines;
  },
};
