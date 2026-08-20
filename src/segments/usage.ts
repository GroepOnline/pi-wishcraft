import type { StatusLineSegment } from "../config/types.ts";
import { getIcons } from "../theme/icons.ts";
import { formatUsdCost } from "../usage/rates.ts";
import { costColorForBudget, tokenBudgetLevel } from "../usage/token-budget.ts";
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
    if (contextPercent > 90) {
      content = colored("contextError");
    } else if (contextPercent > 70) {
      content = colored("contextWarn");
    } else {
      content = colored("context");
    }

    return { content, visible: true };
  },
};

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
