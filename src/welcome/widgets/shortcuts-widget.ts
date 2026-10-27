import { tr } from "../../i18n/index.ts";
import type { WelcomeWidget, WidgetRenderContext } from "../types.ts";

export const ShortcutsWidget: WelcomeWidget = {
  id: "shortcuts",
  render(ctx: WidgetRenderContext): string[] {
    const { dim, bold, color } = ctx;
    const lines: string[] = [];

    lines.push(` ${bold(color("accent", tr("welcome.shortcuts", "Quick Launch / Tactical")))}`);
    lines.push(` ${dim("# <idea>  ")} ${tr("welcome.shortcuts.idea", "capture idea to queue")}`);
    lines.push(` ${dim("alt+p     ")} ${tr("welcome.shortcuts.deck", "tactical powerline overlay")}`);
    lines.push(` ${dim("!cmd      ")} ${tr("welcome.shortcuts.bash", "sticky bash session")}`);
    lines.push(` ${dim("alt+s     ")} ${tr("welcome.shortcuts.stash", "stash/pop prompt draft")}`);

    return lines;
  },
};
