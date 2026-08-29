import type { StatusLineSegment } from "../config/types.ts";
import { getIcons } from "../theme/icons.ts";
import { formatUsdCost } from "../usage/rates.ts";
import { costColorForBudget, tokenBudgetLevel } from "../usage/token-budget.ts";
import { ansi, colorEnabled } from "../theme/colors.ts";
import { color, withIcon, formatTokens } from "./shared.ts";

// ═══════════════════════════════════════════════════════════════════════════
// Segment Implementations
// ═══════════════════════════════════════════════════════════════════════════

export const tokenInSegment: StatusLineSegment = {
  id: "token_in",
  render(ctx) {
    const icons = getIcons();
    const { input } = ctx.usageStats;
    if (!input) return { content: "", visible: false };

    const content = withIcon(icons.input, formatTokens(input));
    return { content: color(ctx, "tokens", content), visible: true };
  },
};

export const tokenOutSegment: StatusLineSegment = {
  id: "token_out",
  render(ctx) {
    const icons = getIcons();
    const { output } = ctx.usageStats;
    if (!output) return { content: "", visible: false };

    const content = withIcon(icons.output, formatTokens(output));
    return { content: color(ctx, "tokens", content), visible: true };
  },
};

export const tokenTotalSegment: StatusLineSegment = {
  id: "token_total",
  render(ctx) {
    const icons = getIcons();
    const { input, output, cacheRead, cacheWrite } = ctx.usageStats;
    const total = input + output + cacheRead + cacheWrite;
    if (!total) return { content: "", visible: false };

    const content = withIcon(icons.tokens, formatTokens(total));
    return { content: color(ctx, "tokens", content), visible: true };
  },
};

export const costSegment: StatusLineSegment = {
  id: "cost",
  render(ctx) {
    const cost = ctx.usageStats.cost + (ctx.usageStats.subagentCost ?? 0);
    const usingSubscription = ctx.usingSubscription;

    if (!cost && !usingSubscription) {
      return { content: "", visible: false };
    }

    const reportedCost =
      cost > 0 ? formatUsdCost(cost, ctx.options.cost?.currency) : null;
    const budgetLevel = tokenBudgetLevel(
      ctx.tokenBudget?.dailyUsed ?? 0,
      ctx.tokenBudget?.dailyLimit ?? null,
    );
    const costColor = costColorForBudget(budgetLevel.level);
    if (!usingSubscription) {
      return reportedCost
        ? { content: color(ctx, costColor, reportedCost), visible: true }
        : { content: "", visible: false };
    }

    const subscriptionDisplay =
      ctx.options.cost?.subscriptionDisplay ?? "subscription";
    if (subscriptionDisplay === "reported-cost" && reportedCost) {
      return { content: color(ctx, costColor, reportedCost), visible: true };
    }
    if (subscriptionDisplay === "both" && reportedCost) {
      return {
        content: color(ctx, costColor, `${reportedCost} (sub)`),
        visible: true,
      };
    }

    return { content: color(ctx, costColor, "(sub)"), visible: true };
  },
};

export const contextPctSegment: StatusLineSegment = {
  id: "context_pct",
  render(ctx) {
    if (ctx.customCompactionEnabled) return { content: "", visible: false };

    const icons = getIcons();
    const { contextTokens, contextPercent, contextWindow } = ctx;
    if (!contextWindow || !Number.isFinite(contextPercent)) {
      return { content: "", visible: false };
    }

    const autoIcon =
      ctx.autoCompactEnabled && icons.auto ? ` ${icons.auto}` : "";
    const percentOnly = ctx.options.context?.format === "percent";
    // "full" (default): tokens/window + one-decimal percentage + auto-compact icon.
    // "percent": bare rounded percentage, threshold-colored, no icons.
    const text = percentOnly
      ? `${Math.round(contextPercent)}%`
      : `${formatTokens(contextTokens)}/${formatTokens(contextWindow)} (${contextPercent.toFixed(1)}%)${autoIcon}`;

    // Icon outside color, text inside - use semantic colors for thresholds
    let content: string;
    const colored = (semantic: "context" | "contextWarn" | "contextError") =>
      percentOnly
        ? color(ctx, semantic, text)
        : withIcon(icons.context, color(ctx, semantic, text));
    let semantic: "context" | "contextWarn" | "contextError";
    if (contextPercent > 90) {
      semantic = "contextError";
    } else if (contextPercent > 70) {
      semantic = "contextWarn";
    } else {
      semantic = "context";
    }
    const baseContent = colored(semantic);

    // Append a compact 8-cell fill bar so usage is scannable at a glance.
    // Filled cells use the semantic color, empty cells use the muted separator.
    const bar = contextFillBar(contextPercent, (s) => color(ctx, s, ""));
    content = percentOnly ? baseContent : `${baseContent} ${bar}`;

    return { content, visible: true };
  },
};

/**
 * Compact 8-cell context fill bar. Filled cells track the usage percentage;
 * the cell color follows the threshold (normal/warn/error) so the bar doubles
 * as a glanceable usage meter alongside the numeric readout.
 */
function contextFillBar(
  percent: number,
  colorFn: (semantic: "context" | "contextWarn" | "contextError") => string,
): string {
  const CELLS = 8;
  // Clamp to the bar's cell count: percentages above 100 must not grow the
  // status line, and negative percentages must not underflow the empty run.
  const filled = Math.max(0, Math.min(CELLS, Math.round((percent / 100) * CELLS)));
  let semantic: "context" | "contextWarn" | "contextError";
  if (percent > 90) {
    semantic = "contextError";
  } else if (percent > 70) {
    semantic = "contextWarn";
  } else {
    semantic = "context";
  }
  // Filled cells are left-aligned, so we can emit them as one colored run,
  // then the empty cells as another — just two color codes total, not one per cell.
  const filledColor = colorFn(semantic);
  const emptyColor = colorFn("context");
  const reset = colorEnabled() ? ansi.reset : "";
  const filledRun = filled > 0 ? `${filledColor}${"▓".repeat(filled)}${reset}` : "";
  const emptyRun = filled < CELLS ? `${emptyColor}${"░".repeat(CELLS - filled)}${reset}` : "";
  return `${filledRun}${emptyRun}`;
}

export const contextTotalSegment: StatusLineSegment = {
  id: "context_total",
  render(ctx) {
    if (ctx.customCompactionEnabled) return { content: "", visible: false };

    const icons = getIcons();
    const window = ctx.contextWindow;
    if (!window) return { content: "", visible: false };

    return {
      content: color(
        ctx,
        "context",
        withIcon(icons.context, formatTokens(window)),
      ),
      visible: true,
    };
  },
};

export const cacheReadSegment: StatusLineSegment = {
  id: "cache_read",
  render(ctx) {
    const icons = getIcons();
    const { cacheRead, input } = ctx.usageStats;
    if (!cacheRead) return { content: "", visible: false };

    const format = ctx.options.cache_read?.format ?? "tokens";
    const hitRate =
      input + cacheRead > 0
        ? ((cacheRead / (input + cacheRead)) * 100).toFixed(0)
        : "0";

    let content: string;
    if (format === "percent") {
      content = [icons.cache, `${hitRate}%`].filter(Boolean).join(" ");
    } else {
      const tokens = [icons.cache, icons.input, formatTokens(cacheRead)]
        .filter(Boolean)
        .join(" ");
      content = format === "both" ? `${tokens} (${hitRate}%)` : tokens;
    }
    return { content: color(ctx, "tokens", content), visible: true };
  },
};

export const cacheWriteSegment: StatusLineSegment = {
  id: "cache_write",
  render(ctx) {
    const icons = getIcons();
    const { cacheWrite } = ctx.usageStats;
    if (!cacheWrite) return { content: "", visible: false };

    const parts = [icons.cache, icons.output, formatTokens(cacheWrite)].filter(
      Boolean,
    );
    const content = parts.join(" ");
    return { content: color(ctx, "tokens", content), visible: true };
  },
};
