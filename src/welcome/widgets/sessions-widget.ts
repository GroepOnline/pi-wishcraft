import type { WelcomeWidget, WidgetRenderContext } from "../types.ts";

export const SessionsWidget: WelcomeWidget = {
  id: "sessions",
  render(ctx: WidgetRenderContext): string[] {
    const { data, dim, bold, color } = ctx;
    const lines: string[] = [];
    
    lines.push(` ${bold(color("accent", "Recent Crafts"))}`);
    
    if (data.recentSessions.length === 0) {
      lines.push(` ${dim("No recent sessions")}`);
    } else {
      for (const session of data.recentSessions.slice(0, 3)) {
        lines.push(
          ` ${dim("• ")}${color("path", session.name)}${dim(` (${session.timeAgo})`)}`
        );
      }
    }
    
    return lines;
  }
};
