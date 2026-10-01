import { tr } from "../../i18n/index.ts";
import { formatTokens } from "../format.ts";
import type { WelcomeWidget, WidgetRenderContext } from "../types.ts";

export const SystemWidget: WelcomeWidget = {
  id: "system",
  render(ctx: WidgetRenderContext): string[] {
    const { data, dim, bold, color } = ctx;
    const lines: string[] = [];

    const prefix = dim("- ");
    lines.push(` ${bold(color("accent", tr("welcome.system", "Active Horizon")))}`);

    lines.push(
      ` ${prefix}${tr("welcome.system.model", "Model")}: ${color("model", data.modelName)} (${dim(data.providerName)})`,
    );

    if (data.initialContextTokens !== null && data.initialContextTokens > 0) {
      lines.push(
        ` ${prefix}${color("gitClean", `≈ ${formatTokens(data.initialContextTokens)}`)} ${tr("welcome.system.tokens", "initial prompt tokens")}`,
      );
    }

    const { extensions, skills } = data.loadedCounts;
    const toolsCount = extensions + skills;
    if (toolsCount > 0) {
      lines.push(
        ` ${prefix}${color("gitClean", `${toolsCount}`)} ${tr("welcome.system.loaded", "skills/extensions loaded")}`,
      );
    }

    return lines;
  },
};
