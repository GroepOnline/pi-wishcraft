import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { BashTranscriptStore } from "../../../bash-mode/transcript.ts";
import { BashCompletionEngine } from "../../../bash-mode/completion.ts";
import { parsePowerlineConfig } from "../../config/powerline-config.ts";
import { policyFromEnvironment } from "../../motion/accessibility.ts";
import { parseMotionSettings } from "../../motion/policy.ts";
import { defaultMotionFor } from "../../motion/catalog.ts";
import { registerCustomSegments } from "../../segments/index.ts";
import { registerCustomPresets } from "../../config/presets.ts";
import { invalidateGitStatus } from "../../git/status.ts";
import { invalidateGitForCommand } from "./git-invalidation.ts";
import {
  initVibeManager,
  onVibeAgentEnd,
  onVibeAgentStart,
  onVibeBeforeAgentStart,
  onVibeToolCall,
  setVibeWorkingMessageColor,
  shutdownVibeManager,
} from "../../working-vibes/index.ts";
import { estimateUnknownContextUsage } from "../../usage/context.ts";
import {
  getUsageTokenTotal,
  isSessionAssistantMessage,
} from "../../usage/ledger.ts";
import { recordSessionUsageDelta } from "./usage-recorder.ts";
import {
  detectCustomCompactionEnabled,
  readSettings,
} from "../settings/settings-io.ts";
import {
  resolveShortcutConfig,
  parseBashModeSettings,
} from "../shortcuts/shortcuts-config.ts";
import { warnInvalidSegmentSettings } from "../ui/layout.ts";
import { readPersistedStashHistory } from "../history/stash-history.ts";
import {
  requestImmediateStatusRender,
  requestStatusRender,
  resetLayoutCache,
  sampleTpsFromSession,
} from "../core/segment-context.ts";
import { getQueueContext } from "../queue/queue-context.ts";
import {
  requestQueueRender,
  schedulePostCompactionDelivery,
  finishFailedCompaction,
} from "../queue/queue-integration.ts";
import { setupCustomEditor } from "../ui/custom-editor.ts";
import { disposeRpcWidgets, installRpcWidgets } from "../ui/rpc-widgets.ts";
import {
  setupWelcomeHeader,
  setupWelcomeOverlay,
} from "../welcome/welcome-integration.ts";
import {
  config,
  PRESET_NAMES,
  setConfig,
  setCustomCompactionEnabled,
} from "../core/state.ts";
import { CONTEXT_STATUS_RENDER_MS } from "../core/constants.ts";
import { maybeNotifyPeerGuard } from "../core/peer-guard.ts";
import type { RuntimeState } from "../core/types.ts";
import { isStaleExtensionContextError } from "./stale-context.ts";
import { dismissWelcome } from "../welcome/welcome-control.ts";
import {
  bindSkillsCountPublisher,
  clearSkillsCountPublisher,
} from "../skills/skill-status.ts";
import { maybeAppendReadHint } from "./read-hints.ts";
import {
  applyNativeWorkingIndicator,
  resetNativeWorkingIndicator,
} from "../../working-vibes/native-indicator.ts";
import {
  dispatchSignalEvent,
  settleSignal,
} from "../../signal/integration.ts";
import {
  maybeNotifyCostAlert,
  maybeNotifyTokenBudget,
} from "./session-notifications.ts";

// Helper to extract recent agent response text (skipping thinking blocks)
function getRecentAgentContext(ctx: any): string | undefined {
  const sessionEvents = ctx.sessionManager?.getBranch?.() ?? [];

  // Find the most recent assistant message
  for (let i = sessionEvents.length - 1; i >= 0; i--) {
    const e = sessionEvents[i];
    if (e.type === "message" && e.message?.role === "assistant") {
      const content = e.message.content;
      if (!Array.isArray(content)) continue;

      // Extract text content, skip thinking blocks
      for (const block of content) {
        if (block.type === "text" && block.text) {
          // Return first ~200 chars of non-empty text
          const text = block.text.trim();
          if (text.length > 0) {
            return text.slice(0, 200);
          }
        }
      }
    }
  }
  return undefined;
}

export function shouldShowStartupWelcome(
  reason: unknown,
  welcomeEnabled: boolean,
): boolean {
  return reason === "startup" && welcomeEnabled;
}

export function registerSessionLifecycle(
  pi: ExtensionAPI,
  rt: RuntimeState,
): void {
  // Track session start
  pi.on("session_start", async (event, ctx) => {
    settleSignal(rt);
    clearSkillsCountPublisher();
    rt.shellSession?.dispose();
    rt.shellSession = null;
    rt.sessionGeneration++;
    rt.sessionStartTime = Date.now();
    rt.currentCtx = ctx;
    // Reloaded sessions start without measured context tokens — estimate
    // from the restored branch so the bar shows ~x% instead of stale data.
    rt.approximateContextUsage =
      event.reason === "reload" ? estimateUnknownContextUsage(ctx) : null;
    setCustomCompactionEnabled(detectCustomCompactionEnabled(ctx.cwd));
    rt.lastUserPrompt = "";
    rt.isStreaming = false;
    rt.liveAssistantUsage = null;
    rt.costAlertNotified = false;
    rt.tokenBudgetNotifiedLevel = 0;
    rt.tokenBudgetSnapshot = { day: "", dailyLimit: null, dailyUsed: 0 };
    rt.sessionUsageBaseline = null;
    rt.powerlineCompacting = false;
    rt.deliverAfterRetrySettles = false;
    rt.stashedEditorText = null;

    const settings = readSettings(ctx.cwd);
    rt.resolvedShortcuts = resolveShortcutConfig(settings);
    rt.bashModeSettings = parseBashModeSettings(settings, rt.resolvedShortcuts);
    rt.showLastPrompt = settings.showLastPrompt !== false;
    setConfig(parsePowerlineConfig(settings.powerline, PRESET_NAMES));
    rt.motionPolicy = policyFromEnvironment(process.env, config.motionLevel);
    rt.paint.setSettings(parseMotionSettings(settings.wishcraft));
    rt.queueStore.setSentRetentionMs(
      config.queue.retentionHours * 60 * 60 * 1000,
    );
    registerCustomSegments(config.segments);
    registerCustomPresets(config.presets);
    warnInvalidSegmentSettings(ctx);
    maybeNotifyPeerGuard(ctx);
    rt.stashedPromptHistory = readPersistedStashHistory();
    rt.bashModeActive = false;
    rt.bashTranscript = new BashTranscriptStore(rt.bashModeSettings);
    rt.bashCompletionEngine = new BashCompletionEngine();

    rt.getThinkingLevelFn = () => ctx.thinkingLevel ?? "off";
    rt.currentThinkingLevel = rt.getThinkingLevelFn();

    if (ctx.hasUI) {
      ctx.ui.setStatus("stash", undefined);
      bindSkillsCountPublisher(ctx);
      const pendingIdeas = rt.queueStore
        .activeItems(getQueueContext(ctx))
        .filter((item) => item.intent === "idea").length;
      if (pendingIdeas > 0) {
        ctx.ui.notify(
          `${pendingIdeas} idea${pendingIdeas === 1 ? "" : "s"} waiting — /ideas`,
          "info",
        );
      }
    }

    // Initialize vibe manager (needs modelRegistry from ctx)
    initVibeManager(ctx);
    setVibeWorkingMessageColor(config.workingVibes.color);

    if (rt.enabled && ctx.hasUI) {
      if (ctx.mode === "rpc") {
        // In rpc mode component factories, custom overlays, the editor and
        // footer/header are all no-ops; widgets only cross the wire as
        // string[] lines. `ctx.hasUI` is still true, so gate on the mode.
        installRpcWidgets(rt, ctx);
        if (shouldShowStartupWelcome(event.reason, config.welcome)) {
          ctx.ui.notify(
            `Wishcraft cockpit active (preset: ${config.preset})`,
            "info",
          );
        }
      } else {
        setupCustomEditor(pi, rt, ctx);
        if (shouldShowStartupWelcome(event.reason, config.welcome)) {
          if (settings.quietStartup === true) {
            setupWelcomeHeader(rt, ctx);
          } else {
            setupWelcomeOverlay(rt, ctx);
          }
        } else {
          dismissWelcome(rt, ctx);
        }
      }
      maybeNotifyTokenBudget(rt, ctx, settings);
    }
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    // Last flush: anything billed since the previous boundary still lands in
    // the day file before the session state is torn down.
    recordSessionUsageDelta(rt, ctx);
    rt.sessionUsageBaseline = null;
    rt.approximateContextUsage = null;
    clearSkillsCountPublisher();
    rt.sessionGeneration++;
    rt.dismissWelcomeOverlay?.();
    rt.dismissWelcomeOverlay = null;
    rt.welcomeHeaderActive = false;
    rt.welcomeOverlayShouldDismiss = false;
    rt.welcomeDismissScheduler.cancel();
    rt.statusRenderScheduler.cancel();
    rt.paint.reset();
    rt.motionScheduler.dispose();
    rt.restoreFooterStatusRepaintHook?.();
    rt.restoreFooterStatusRepaintHook = null;
    rt.stashShortcutInputUnsubscribe?.();
    rt.stashShortcutInputUnsubscribe = null;
    rt.shellSession?.dispose();
    rt.shellSession = null;
    rt.studioAbort?.abort();
    rt.studioAbort = null;
    shutdownVibeManager();
    if (rt.queueDeliveryTimer) {
      clearTimeout(rt.queueDeliveryTimer);
      rt.queueDeliveryTimer = null;
    }
    rt.powerlineCompacting = false;
    rt.deliverAfterRetrySettles = false;
    rt.bashModeActive = false;
    rt.currentCtx = null;
    rt.footerDataRef = null;
    rt.getThinkingLevelFn = null;
    rt.currentThinkingLevel = null;
    rt.liveAssistantUsage = null;
    rt.tokenBudgetSnapshot = { day: "", dailyLimit: null, dailyUsed: 0 };
    rt.tuiRef = null;
    rt.rpcWidgetRefresh = null;
    disposeRpcWidgets();
    rt.currentEditor = null;
    resetLayoutCache(rt);
  });

  // Invalidate git status on file changes, trigger re-render on potential branch changes
  pi.on("tool_result", async (event, ctx) => {
    if (event.toolName === "write" || event.toolName === "edit") {
      invalidateGitStatus();
      requestStatusRender(rt);
    }
    // Check for bash commands that might change git branch
    if (event.toolName === "bash" && event.input?.command) {
      invalidateGitForCommand(rt, String(event.input.command));
    }
    if (event.toolName === "read") {
      return maybeAppendReadHint(event, ctx?.cwd);
    }
  });

  // Also catch user escape commands (! prefix)
  // Note: This fires BEFORE execution, so we use a longer delay and multiple re-renders
  // to ensure we catch the update after the command completes.
  pi.on("user_bash", async (event) => {
    invalidateGitForCommand(rt, event.command, { stagger: true });
  });

  pi.on("model_select", async (_event, ctx) => {
    rt.currentCtx = ctx;
    rt.coreContextUsageCache.reset();
    rt.approximateContextUsage = null;
    requestStatusRender(rt);
  });

  pi.on("thinking_level_select", async (event, ctx) => {
    rt.currentCtx = ctx;
    rt.currentThinkingLevel =
      rt.getThinkingLevelFn?.() ??
      (typeof event.level === "string" ? event.level : null);
    requestImmediateStatusRender(rt, { deferDuringTyping: false });
  });

  pi.on("session_tree", async (_event, ctx) => {
    rt.currentCtx = ctx;
    rt.currentThinkingLevel = null;
    rt.liveAssistantUsage = null;
    rt.approximateContextUsage = null;
    // The ledger snapshot keys on leaf + entry count; SDKs without a count
    // rely on this reset to notice entries appended off the active leaf.
    rt.tokenStatsCache.reset();
    // Branch summaries bill their own LLM call — flush whatever landed.
    recordSessionUsageDelta(rt, ctx);
    requestImmediateStatusRender(rt, { deferDuringTyping: false });
  });

  // Renaming a session changes what the session segment shows.
  pi.on("session_info_changed", async (_event, ctx) => {
    rt.currentCtx = ctx;
    requestImmediateStatusRender(rt, { deferDuringTyping: false });
  });

  // turn_start fires per provider-request turn; agent_start sets the
  // fallback. Without this, TTFT for turns 2+ divides by turn-1's start.
  pi.on("turn_start", async (_event, ctx) => {
    rt.currentCtx = ctx;
    rt.turnStartedAt = Date.now();
  });

  // Generate themed working message before agent starts (has access to user's prompt)
  pi.on("before_agent_start", async (event, ctx) => {
    const prompt =
      event.messageType === "user"
        ? event.prompt
        : event.message.display && typeof event.message.content === "string"
          ? event.message.content
          : "";
    rt.lastUserPrompt = prompt;
    if (ctx.hasUI) {
      onVibeBeforeAgentStart(prompt, ctx.ui.setWorkingMessage);
      applyNativeWorkingIndicator(ctx.ui, rt.motionPolicy, defaultMotionFor("thinking"));
    }
  });

  // Track streaming state (footer only shows status during streaming)
  // Also dismiss welcome when agent starts responding (handles `p "command"` case)
  pi.on("agent_start", async (_event, ctx) => {
    rt.isStreaming = true;
    rt.paint.sync();
    rt.turnStartedAt = Date.now();
    rt.liveAssistantUsage = null;
    onVibeAgentStart();
    dismissWelcome(rt, ctx);
    rt.currentCtx = ctx;
    dispatchSignalEvent(rt, config.appearance, "thinking");
  });

  pi.on("message_update", async (event, ctx) => {
    if (
      isSessionAssistantMessage(event.message) &&
      event.message.stopReason !== "error" &&
      event.message.stopReason !== "aborted" &&
      getUsageTokenTotal(event.message.usage) > 0
    ) {
      rt.liveAssistantUsage = event.message.usage;
      // Real provider usage arrived — drop the post-compaction estimate so it
      // cannot keep outranking measured context for the rest of the stream.
      rt.approximateContextUsage = null;
      rt.currentCtx = ctx;
      rt.layoutDirty = true;
      try {
        sampleTpsFromSession(rt, ctx);
      } catch (error) {
        if (!isStaleExtensionContextError(error)) throw error;
      }
      rt.statusRenderScheduler.schedule(CONTEXT_STATUS_RENDER_MS);
      if (rt.signal.event !== "streaming") {
        dispatchSignalEvent(rt, config.appearance, "streaming");
      }
    }
  });

  pi.on("message_end", async (event, ctx) => {
    rt.currentCtx = ctx;
    rt.coreContextUsageCache.reset();
    if (isSessionAssistantMessage(event.message)) {
      if (
        event.message.stopReason === "error" ||
        event.message.stopReason === "aborted"
      ) {
        rt.liveAssistantUsage = null;
      } else if (getUsageTokenTotal(event.message.usage) > 0) {
        rt.liveAssistantUsage = event.message.usage;
        rt.lastAssistantAt = Date.now();
        rt.approximateContextUsage = null;
      }
    }
    recordSessionUsageDelta(rt, ctx);
    requestImmediateStatusRender(rt, { deferDuringTyping: false });
    maybeNotifyCostAlert(rt, ctx);
    maybeNotifyTokenBudget(rt, ctx);
  });

  pi.on("turn_end", async (_event, ctx) => {
    rt.currentCtx = ctx;
    rt.coreContextUsageCache.reset();
    // Usage can land without a message_end tail (toolResult charges, usage
    // entries); the delta flush picks up whatever the ledger billed.
    recordSessionUsageDelta(rt, ctx);
    requestImmediateStatusRender(rt, { deferDuringTyping: false });
  });

  pi.on("session_before_compact", async (_event, ctx) => {
    rt.powerlineCompacting = true;
    rt.approximateContextUsage = null;
    rt.isStreaming = false;
    rt.liveAssistantUsage = null;
    rt.coreContextUsageCache.reset();
    rt.currentCtx = ctx;
    requestQueueRender(rt);
    dispatchSignalEvent(rt, config.appearance, "compact");
  });

  pi.on("session_compact", async (event, ctx) => {
    rt.powerlineCompacting = false;
    rt.lastCompactionAt = Date.now();
    rt.currentCtx = ctx;
    // Compaction rewrites the conversation, so the cached context-usage (tokens/window/percent)
    // is stale. Reset it and force a redraw — otherwise the bar keeps showing the pre-compact fill.
    rt.coreContextUsageCache.reset();
    // The compaction entry carries the summary call's usage on the ledger.
    recordSessionUsageDelta(rt, ctx);
    // Pi reports tokens===null until the next request lands; estimate the
    // post-compact context so the bar shows ~x% instead of jumping to 0.
    rt.approximateContextUsage = estimateUnknownContextUsage(ctx);
    requestImmediateStatusRender(rt, { deferDuringTyping: false });
    if (event.willRetry) {
      rt.deliverAfterRetrySettles = true;
    } else {
      rt.deliverAfterRetrySettles = false;
      schedulePostCompactionDelivery(pi, rt, ctx);
    }
    requestQueueRender(rt);
  });

  // pi 0.84.0+ emits `session_compact_failed` (not `session_compact`) when
  // auto-compaction or /compact fails or is aborted. Without this handler
  // `powerlineCompacting` stays true and the bar keeps showing the compact
  // rail forever, even though the agent is idle. Root cause of the stuck
  // "COMPACTING" seen on 2026-08-27.
  pi.on("session_compact_failed", async (event, ctx) => {
    rt.powerlineCompacting = false;
    rt.deliverAfterRetrySettles = false;
    rt.approximateContextUsage = null;
    rt.currentCtx = ctx;
    rt.coreContextUsageCache.reset();
    requestImmediateStatusRender(rt, { deferDuringTyping: false });
    dispatchSignalEvent(
      rt,
      config.appearance,
      event.errorMessage ? "error" : "idle",
      event.errorMessage ? "compact failed" : undefined,
    );
    finishFailedCompaction(rt, ctx, event.errorMessage ?? "Compaction cancelled");
    requestQueueRender(rt);
  });

  pi.on("agent_settled", async (_event, ctx) => {
    if (rt.powerlineCompacting) {
      finishFailedCompaction(rt, ctx, "Compaction did not complete");
      return;
    }
    if (rt.deliverAfterRetrySettles) {
      rt.deliverAfterRetrySettles = false;
      schedulePostCompactionDelivery(pi, rt, ctx);
    }
  });

  // Also dismiss on tool calls (agent is working) + refresh vibe if rate limit allows
  pi.on("tool_call", async (event, ctx) => {
    dismissWelcome(rt, ctx);
    dispatchSignalEvent(
      rt,
      config.appearance,
      "tool.start",
      `tool ${event.toolName}`,
    );
    if (ctx.hasUI) {
      // Extract recent agent context from session for richer vibe generation
      const agentContext = getRecentAgentContext(ctx);
      onVibeToolCall(
        event.toolName,
        event.input,
        ctx.ui.setWorkingMessage,
        agentContext,
      );
    }
  });

  pi.on("agent_end", async (_event, ctx) => {
    rt.isStreaming = false;
    rt.paint.sync();
    rt.turnStartedAt = null;
    rt.liveAssistantUsage = null;
    rt.coreContextUsageCache.reset();
    recordSessionUsageDelta(rt, ctx);
    dispatchSignalEvent(rt, config.appearance, "success");

    let hasUI = false;
    try {
      hasUI = Boolean(ctx.hasUI);
    } catch (error) {
      if (!isStaleExtensionContextError(error)) throw error;
      rt.currentCtx = null;
      return;
    }

    rt.currentCtx = ctx;
    try {
      if (hasUI) {
        onVibeAgentEnd(ctx.ui.setWorkingMessage); // working-vibes internal state + reset message
        resetNativeWorkingIndicator(ctx.ui);
        if (rt.stashedEditorText !== null) {
          if (ctx.ui.getEditorText().trim() === "") {
            ctx.ui.setEditorText(rt.stashedEditorText);
            rt.stashedEditorText = null;
            ctx.ui.setStatus("stash", undefined);
            ctx.ui.notify("Stash restored", "info");
          } else {
            ctx.ui.notify(
              "Stash preserved — clear editor then Alt+S to restore",
              "info",
            );
          }
        }
        maybeNotifyCostAlert(rt, ctx);
      }
    } catch (error) {
      if (!isStaleExtensionContextError(error)) throw error;
      rt.currentCtx = null;
      return;
    }

    requestStatusRender(rt);
    if (!rt.powerlineCompacting && !rt.deliverAfterRetrySettles) {
      schedulePostCompactionDelivery(pi, rt, ctx);
    }
  });
}