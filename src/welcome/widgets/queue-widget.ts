import type { WelcomeWidget, WidgetRenderContext } from "../types.ts";

export const QueueWidget: WelcomeWidget = {
  id: "queue",
  render(ctx: WidgetRenderContext): string[] {
    const { data, dim, color } = ctx;
    const lines: string[] = [];

    const prefix = dim("- ");
    const idea = data.nextIdeaText?.trim();
    if (idea) {
      const singleLine = idea.replace(/\s+/g, " ");
      const budget = Math.max(1, ctx.width - prefix.length - 3 - "/ideas next".length - 2);
      const preview = singleLine.length > budget
        ? `${singleLine.slice(0, Math.max(0, budget - 1))}…`
        : singleLine;
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
