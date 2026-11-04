import { tr } from "../../i18n/index.ts";
import type { WelcomeWidget, WidgetRenderContext } from "../types.ts";

export const SessionsWidget: WelcomeWidget = {
  id: "sessions",
  render(ctx: WidgetRenderContext): string[] {
    const { data, dim, bold, color } = ctx;
    const lines: string[] = [];
    const focused =
      data.focus?.section === "sessions" ? data.focus.index : null;

    lines.push(` ${bold(color("accent", tr("welcome.sessions", "Recent Crafts")))}`);

    if (data.recentSessions.length === 0) {
      lines.push(` ${dim(tr("welcome.sessions.none", "No recent sessions"))}`);
      return lines;
    }

    data.recentSessions.slice(0, 3).forEach((session, index) => {
      const marker = focused === index ? color("accent", "▸ ") : dim("• ");
      lines.push(
        ` ${marker}${color("path", session.name)}${dim(` (${session.timeAgo})`)}`
      );
    });

    return lines;
  },
};
