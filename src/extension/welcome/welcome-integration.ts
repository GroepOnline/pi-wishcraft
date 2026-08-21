import {
  WelcomeComponent,
  WelcomeHeader,
  discoverLoadedCounts,
  discoverWhatsNew,
  getRecentSessions,
  normalizeWelcomeArt,
  type WelcomeArtTheme,
} from "../../welcome/index.ts";
import { estimateInitialContextTokens } from "../../usage/context.ts";
import { isRecord, readSettings } from "../settings/settings-io.ts";
import type { RuntimeState } from "../core/types.ts";
import { getQueueContext } from "../queue/queue-context.ts";
import { pickNextReviewIdea } from "../queue/idea-review.ts";
import { setWelcomeHeaderAnimation } from "./welcome-control.ts";

interface WelcomeArtSettings {
  art: WelcomeArtTheme;
  animate: boolean;
}

/** Read `wishcraft.welcome.{art,animateLantern}` from settings.json. */
function readWelcomeArtSettings(ctx: any): WelcomeArtSettings {
  const settings = readSettings(ctx.cwd ?? process.cwd());
  const wishcraft = isRecord(settings.wishcraft) ? settings.wishcraft : {};
  const welcome = isRecord(wishcraft.welcome) ? wishcraft.welcome : {};
  return {
    art: normalizeWelcomeArt(welcome.art),
    animate: welcome.animateLantern === true,
  };
}

export function setupWelcomeHeader(rt: RuntimeState, ctx: any) {
  const modelName = ctx.model?.name || ctx.model?.id || "No model";
  const providerName = ctx.model?.provider || "Unknown";
  const loadedCounts = discoverLoadedCounts();
  const recentSessions = getRecentSessions(3);
  const initialContextTokens = estimateInitialContextTokens(ctx);
  const queueSummary = rt.queueStore.summarize(getQueueContext(ctx), false);
  const queueCount = queueSummary.queueCount + queueSummary.ideaCount;
  const hasStash =
    rt.stashedEditorText !== null || rt.stashedPromptHistory.length > 0;
  const nextIdeaText = pickNextReviewIdea(
    rt.queueStore.activeItems(getQueueContext(ctx)),
  )?.text;
  const whatsNew = discoverWhatsNew();

  const header = new WelcomeHeader(
    modelName,
    providerName,
    recentSessions,
    loadedCounts,
    initialContextTokens,
    queueCount,
    hasStash,
    whatsNew,
    nextIdeaText,
  );
  const refreshArt = () => {
    const artSettings = readWelcomeArtSettings(ctx);
    header.setArt(artSettings.art, artSettings.animate);
    setWelcomeHeaderAnimation(
      rt,
      artSettings.art === "lantern" && artSettings.animate,
    );
    rt.tuiRef?.requestRender?.();
  };
  rt.refreshWelcomeArt = refreshArt;
  refreshArt();
  rt.welcomeHeaderActive = true;

  ctx.ui.setHeader(() => {
    return {
      render(width: number): string[] {
        return header.render(width);
      },
      invalidate() {
        header.invalidate();
      },
    };
  });
}

export function setupWelcomeOverlay(rt: RuntimeState, ctx: any) {
  const modelName = ctx.model?.name || ctx.model?.id || "No model";
  const providerName = ctx.model?.provider || "Unknown";
  const loadedCounts = discoverLoadedCounts();
  const recentSessions = getRecentSessions(3);

  const overlaySessionGeneration = rt.sessionGeneration;

  // Small delay to let pi-mono finish initialization
  setTimeout(() => {
    if (
      !rt.enabled ||
      rt.welcomeOverlayShouldDismiss ||
      rt.isStreaming ||
      overlaySessionGeneration !== rt.sessionGeneration
    ) {
      rt.welcomeOverlayShouldDismiss = false;
      return;
    }

    const sessionEvents = ctx.sessionManager?.getBranch?.() ?? [];
    const hasActivity = sessionEvents.some((entry: unknown) => {
      if (!isRecord(entry)) return false;
      if (entry.type === "tool_call" || entry.type === "tool_result")
        return true;
      return (
        entry.type === "message" &&
        isRecord(entry.message) &&
        entry.message.role === "assistant"
      );
    });
    if (hasActivity) {
      return;
    }

    const initialContextTokens = estimateInitialContextTokens(ctx);
    const queueSummary = rt.queueStore.summarize(getQueueContext(ctx), false);
    const queueCount = queueSummary.queueCount + queueSummary.ideaCount;
    const hasStash =
      rt.stashedEditorText !== null || rt.stashedPromptHistory.length > 0;
    const nextIdeaText = pickNextReviewIdea(
      rt.queueStore.activeItems(getQueueContext(ctx)),
    )?.text;
    const whatsNew = discoverWhatsNew();

    ctx.ui
      .custom(
        (
          tui: any,
          _theme: any,
          _keybindings: any,
          done: (result: void) => void,
        ) => {
          const welcome = new WelcomeComponent(
            modelName,
            providerName,
            recentSessions,
            loadedCounts,
            initialContextTokens,
            queueCount,
            hasStash,
            whatsNew,
            nextIdeaText,
          );
          const refreshArt = () => {
            const artSettings = readWelcomeArtSettings(ctx);
            welcome.setArt(artSettings.art, artSettings.animate);
            tui.requestRender();
          };
          rt.refreshWelcomeArt = refreshArt;
          refreshArt();

          let countdown = 30;
          let dismissed = false;
          let interval: ReturnType<typeof setInterval> | null = null;

          const dismiss = () => {
            if (dismissed) return;
            dismissed = true;
            if (interval) clearInterval(interval);
            rt.dismissWelcomeOverlay = null;
            if (rt.refreshWelcomeArt === refreshArt) rt.refreshWelcomeArt = null;
            done();
          };

          interval = setInterval(() => {
            if (dismissed) return;
            countdown--;
            welcome.setCountdown(countdown);
            tui.requestRender();
            if (countdown <= 0) dismiss();
          }, 1000);

          rt.dismissWelcomeOverlay = dismiss;

          if (rt.welcomeOverlayShouldDismiss) {
            rt.welcomeOverlayShouldDismiss = false;
            dismiss();
          }

          return {
            focused: false,
            invalidate: () => welcome.invalidate(),
            render: (width: number) => welcome.render(width),
            handleInput: () => dismiss(),
            dispose: () => {
              dismissed = true;
              if (interval) clearInterval(interval);
              if (rt.refreshWelcomeArt === refreshArt) rt.refreshWelcomeArt = null;
            },
          };
        },
        {
          overlay: true,
          overlayOptions: () => ({
            verticalAlign: "center",
            horizontalAlign: "center",
          }),
        },
      )
      .catch((error: unknown) => {
        console.debug("[wishcraft] Welcome overlay failed:", error);
      });
  }, 100);
}
