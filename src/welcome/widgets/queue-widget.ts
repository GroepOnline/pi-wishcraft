import type { WelcomeWidget, WidgetRenderContext } from "../types.ts";

export const QueueWidget: WelcomeWidget = {
  id: "queue",
  render(ctx: WidgetRenderContext): string[] {
    const { data, dim, color } = ctx;
    const lines: string[] = [];

    const prefix = dim("- ");
    const idea = data.nextIdeaText?.trim();
    if (idea) {
      const preview = idea.length > 42 ? `${idea.slice(0, 41)}…` : idea;
      lines.push(
        ` ${prefix}${color("gitClean", preview)} · ${color("model", "/ideas next")}`,
      );
    } else if (data.queueCount && data.queueCount > 0) {
      lines.push(` ${prefix}${color("gitClean", `${data.queueCount}`)} queued items ready`);
    } else {
      lines.push(` ${prefix}type ${color("model", "# <idea>")} to capture a thought`);
    }

    if (data.hasStash) {
      lines.push(` ${prefix}${color("gitClean", "1")} draft stashed (Alt+S to pop)`);
    } else {
      lines.push(` ${prefix}press ${color("model", "alt+s")} to park a draft`);
    }

    lines.push(` ${prefix}${dim("dreaming & mission queue ready")}`);

    return lines;
  }
};
