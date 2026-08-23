import type { WelcomeWidget, WidgetRenderContext } from "../types.ts";
import { renderSparkline } from "../../tools/graph.ts";

/**
 * Graph widget that renders a mini token sparkline and telemetry activity.
 */
export const graphWidget: WelcomeWidget = {
  id: "graph",
  render(ctx: WidgetRenderContext): string[] {
    const lines: string[] = [];
    const hChar = "─";
    const separator = ` ${ctx.dim(hChar.repeat(Math.max(1, ctx.width - 2)))}`;

    lines.push(` ${ctx.bold(ctx.color("accent", "Telemetry Sparkline"))}`);

    // Sample usage trend points
    const sampleData = [1200, 2400, 3100, 2800, 4500, 6200, 8900, 11400, 9800, 12400];
    const sparkline = renderSparkline(sampleData, 12);
    
    lines.push(` ${ctx.dim("activity:")} ${ctx.color("gitClean", sparkline)} ${ctx.dim("12.4k tok")}`);
    lines.push(separator);

    return lines;
  },
};
