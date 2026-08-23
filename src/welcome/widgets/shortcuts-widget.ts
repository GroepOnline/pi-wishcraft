import type { WelcomeWidget, WidgetRenderContext } from "../types.ts";

export const ShortcutsWidget: WelcomeWidget = {
  id: "shortcuts",
  render(ctx: WidgetRenderContext): string[] {
    const { dim, bold, color } = ctx;
    const lines: string[] = [];
    
    lines.push(` ${bold(color("accent", "Quick Launch / Tactical"))}`);
    lines.push(` ${dim("# <idea>  ")} capture idea to queue`);
    lines.push(` ${dim("alt+p     ")} tactical powerline overlay`);
    lines.push(` ${dim("!cmd      ")} sticky bash session`);
    lines.push(` ${dim("alt+s     ")} stash/pop prompt draft`);
    
    return lines;
  }
};
