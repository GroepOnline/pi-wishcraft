import { tr } from "../../i18n/index.ts";
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
      const nextLabel = "/ideas next";
      const budget = Math.max(1, ctx.width - prefix.length - 3 - nextLabel.length - 2);
      const preview = singleLine.length > budget
        ? `${singleLine.slice(0, Math.max(0, budget - 1))}…`
        : singleLine;
      lines.push(
        ` ${prefix}${color("gitClean", preview)} · ${color("model", nextLabel)}`,
      );
    } else if (data.queueCount && data.queueCount > 0) {
      lines.push(
        ` ${prefix}${color("gitClean", `${data.queueCount}`)} ${tr("welcome.queue.items", "queued items ready")}`,
      );
    } else {
      lines.push(
        ` ${prefix}${tr("welcome.queue.capture", "type")} ${color("model", "# <idea>")} ${tr("welcome.queue.captureTail", "to capture a thought")}`,
      );
    }

    if (data.hasStash) {
      lines.push(
        ` ${prefix}${color("gitClean", "1")} ${tr("welcome.queue.stashed", "draft stashed (Alt+S to pop)")}`,
      );
    } else {
      lines.push(
        ` ${prefix}${tr("welcome.queue.park", "press")} ${color("model", "alt+s")} ${tr("welcome.queue.parkTail", "to park a draft")}`,
      );
    }

    lines.push(` ${prefix}${dim(tr("welcome.queue.ready", "dreaming & mission queue ready"))}`);

    return lines;
  },
};
