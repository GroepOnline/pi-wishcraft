import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

import type { SegmentContext } from "../../config/types.ts";
import { getPreset } from "../../config/presets.ts";
import { resolveAppearanceMix } from "../../config/appearance.ts";
import {
  collectHiddenExtensionStatusKeys,
  getNotificationExtensionStatuses,
} from "../../config/powerline-config.ts";
import { ansi, colorEnabled, getFgAnsiCode } from "../../theme/colors.ts";
import { hasNerdFonts } from "../../theme/icons.ts";

import { getQueueContext } from "../queue/queue-context.ts";
import { buildSegmentContext } from "../core/segment-context.ts";
import {
  EDITOR_STATUS_DEFER_MS,
  LAYOUT_CACHE_TTL_MS,
  STREAMING_LAYOUT_CACHE_TTL_MS,
} from "../core/constants.ts";
import { config } from "../core/state.ts";
import type { RuntimeState } from "../core/types.ts";
import { prefersAsciiGlyphs } from "../../motion/index.ts";
import { renderSignal } from "../../signal/render.ts";

/**
 * Get cached responsive layout or compute fresh one.
 * The segment context scans session state, so keep it stable across render bursts.
 */
export function getResponsiveLayout(
  rt: RuntimeState,
  width: number,
  theme: Theme,
): { topContent: string; secondaryContent: string } {
  const now = Date.now();
  const cacheTtl = rt.isStreaming
    ? STREAMING_LAYOUT_CACHE_TTL_MS
    : LAYOUT_CACHE_TTL_MS;

  if (rt.lastLayoutResult && rt.lastLayoutWidth === width) {
    const msSinceInput = now - rt.lastEditorInputAt;
    const typingRecently = msSinceInput < EDITOR_STATUS_DEFER_MS;

    if (
      !rt.forceNextLayoutRecompute &&
      typingRecently &&
      (rt.layoutDirty || now - rt.lastLayoutTimestamp >= cacheTtl)
    ) {
      return rt.lastLayoutResult;
    }

    if (!rt.layoutDirty && now - rt.lastLayoutTimestamp < cacheTtl) {
      return rt.lastLayoutResult;
    }
  }

  const presetDef = getPreset(config.preset);
  let segmentCtx: SegmentContext;
  try {
    segmentCtx = buildSegmentContext(rt, rt.currentCtx, theme);
  } catch (error) {
    const isStale =
      error instanceof Error &&
      (error.message.includes("This extension instance is stale") ||
        error.message.includes("This extension ctx is stale"));
    if (!isStale) throw error;
    rt.currentCtx = null;
    rt.lastLayoutWidth = width;
    rt.lastLayoutResult = { topContent: "", secondaryContent: "" };
    rt.lastLayoutTimestamp = now;
    rt.layoutDirty = false;
    rt.forceNextLayoutRecompute = false;
    return rt.lastLayoutResult;
  }

  rt.lastLayoutWidth = width;
  const appearance = resolveAppearanceMix(config.appearance);
  rt.lastLayoutResult = renderSignal(
    segmentCtx,
    presetDef,
    rt.signal,
    width,
    {
      separatorStyle: config.separator ?? presetDef.separator,
      signal: appearance.signal,
      ascii: prefersAsciiGlyphs(rt.motionPolicy, hasNerdFonts()),
      layout: config.layout,
      disabledSegments: config.disabledSegments,
    },
  );
  rt.lastLayoutTimestamp = now;
  rt.layoutDirty = false;
  rt.forceNextLayoutRecompute = false;

  return rt.lastLayoutResult;
}

export function renderPowerlineStatusLines(
  rt: RuntimeState,
  width: number,
): string[] {
  if (!rt.currentCtx || !rt.footerDataRef) return [];

  const statuses = rt.footerDataRef.getExtensionStatuses();
  if (!statuses || statuses.size === 0) return [];
  const hiddenExtensionStatusKeys = collectHiddenExtensionStatusKeys(
    config.customItems,
  );

  const notifications: string[] = [];
  for (const value of getNotificationExtensionStatuses(
    statuses,
    hiddenExtensionStatusKeys,
  )) {
    const lineContent = ` ${value}`;
    if (visibleWidth(lineContent) <= width) {
      notifications.push(lineContent);
    }
  }

  return notifications;
}

export function renderPowerlinePrimaryLines(
  rt: RuntimeState,
  width: number,
  theme: Theme,
): string[] {
  if (!rt.currentCtx) return [];

  const layout = getResponsiveLayout(rt, width, theme);
  return layout.topContent ? [layout.topContent] : [];
}

export function renderPowerlineSecondaryLines(
  rt: RuntimeState,
  width: number,
  theme: Theme,
): string[] {
  if (!rt.currentCtx) return [];

  const layout = getResponsiveLayout(rt, width, theme);
  return layout.secondaryContent ? [layout.secondaryContent] : [];
}

export function renderPowerlineQueuePreviewLines(
  rt: RuntimeState,
  width: number,
  theme: Theme,
): string[] {
  if (!rt.currentCtx) return [];
  const summary = rt.queueStore.summarize(
    getQueueContext(rt.currentCtx),
    rt.powerlineCompacting,
  );
  if (!summary.leadingText) return [];

  const prefix =
    summary.leadingStatus === "blocked" || summary.leadingStatus === "failed"
      ? "blocked: "
      : summary.leadingStatus === "delivering"
        ? "sending: "
        : summary.leadingIntent === "idea"
          ? "idea: "
          : "queued: ";
  const text = `${prefix}${summary.leadingText.replace(/\s+/g, " ").trim()}`;
  const color =
    summary.leadingStatus === "blocked" || summary.leadingStatus === "failed"
      ? "warning"
      : "dim";
  return [
    ` ${theme.fg(color, truncateToWidth(text, Math.max(1, width - 1), "…"))}`,
  ];
}

export function renderBashTranscriptLines(
  rt: RuntimeState,
  width: number,
  theme: Theme,
): string[] {
  if (!rt.bashModeActive) return [];

  const snapshot = rt.bashTranscript.getSnapshot();
  if (snapshot.commands.length === 0) return [];

  const lines: string[] = [];
  if (snapshot.truncatedCommands > 0) {
    lines.push(
      ` ${theme.fg("dim", `… ${snapshot.truncatedCommands} earlier command${snapshot.truncatedCommands === 1 ? "" : "s"} truncated`)}`,
    );
  }

  const recentCommands = snapshot.commands.slice(-4);
  for (const command of recentCommands) {
    const promptGlyph =
      (rt.shellSession?.state.shellName ?? "shell") === "fish" ? ">" : "$";
    const status =
      command.exitCode === null
        ? theme.fg("accent", "running")
        : command.exitCode === 0
          ? theme.fg("success", "ok")
          : theme.fg("error", `exit ${command.exitCode}`);
    const commandLine = truncateToWidth(
      command.command.replace(/\s+/g, " ").trim(),
      Math.max(8, width - 8),
      "…",
    );
    lines.push(
      ` ${theme.fg("accent", promptGlyph)} ${commandLine} ${theme.fg("dim", "(")}${status}${theme.fg("dim", ")")}`,
    );

    const outputTail = command.output.slice(-6);
    for (const outputLine of outputTail) {
      lines.push(
        `   ${truncateToWidth(outputLine, Math.max(1, width - 3), "…")}`,
      );
    }
  }

  return lines.slice(-16);
}

export function renderLastPromptLines(
  rt: RuntimeState,
  width: number,
): string[] {
  if (rt.bashModeActive || !rt.showLastPrompt || !rt.lastUserPrompt) return [];

  const reset = colorEnabled() ? ansi.reset : "";
  const prefix = ` ${getFgAnsiCode("sep")}↳${reset} `;
  const availableWidth = width - visibleWidth(prefix);
  if (availableWidth < 10) return [];

  let promptText = rt.lastUserPrompt.replace(/\s+/g, " ").trim();
  if (!promptText) return [];

  promptText = truncateToWidth(promptText, availableWidth, "…");

  const styledPrompt = `${getFgAnsiCode("sep")}${promptText}${reset}`;
  const line = `${prefix}${styledPrompt}`;
  return [truncateToWidth(line, width, "…")];
}
