import {
  WelcomeComponent,
  WelcomeHeader,
  discoverLoadedCounts,
  discoverWhatsNew,
  getRecentSessions,
  normalizeWelcomeArt,
  type WelcomeArtTheme,
} from "../../welcome/index.ts";
import { BOOT_REVEAL_HEARTBEAT_MS, bootRevealActive } from "../../welcome/banner.ts";
import { estimateInitialContextTokens } from "../../usage/context.ts";
import { isRecord, readSettings } from "../settings/settings-io.ts";
import type { RuntimeState } from "../core/types.ts";
import { getQueueContext } from "../queue/queue-context.ts";
import { pickNextReviewIdea } from "../queue/idea-review.ts";

/**
 * Drive the header's boot reveal: repaint on a heartbeat while the reveal
 * window is open, then stop — a bounded one-shot, zero timers afterwards.
 * The header samples its own elapsed time on every render; this only feeds
 * it repaints while the ramp is running.
 */
function armHeaderRevealTimer(rt: RuntimeState): void {
  const startedAt = Date.now();
  const interval = setInterval(() => {
    if (!bootRevealActive(startedAt, Date.now())) {
      clearInterval(interval);
      return;
    }
    rt.tuiRef?.requestRender();
  }, BOOT_REVEAL_HEARTBEAT_MS);
  if (typeof interval.unref === "function") interval.unref();
}

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
  const artSettings = readWelcomeArtSettings(ctx);
  header.setArt(artSettings.art, artSettings.animate);
  header.armBootReveal();
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
  armHeaderRevealTimer(rt);
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
          const artSettings = readWelcomeArtSettings(ctx);
          welcome.setArt(artSettings.art, artSettings.animate);
          welcome.armBootReveal();

          let countdown = 30;
          let dismissed = false;
          let interval: ReturnType<typeof setInterval> | null = null;

          const dismiss = () => {
            if (dismissed) return;
            dismissed = true;
            if (interval) clearInterval(interval);
            rt.dismissWelcomeOverlay = null;
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
