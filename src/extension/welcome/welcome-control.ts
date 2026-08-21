import type { RuntimeState } from "../core/types.ts";

// Header animation is intentionally stopped when the header is dismissed.
const headerTimers = new WeakMap<object, ReturnType<typeof setInterval>>();

export function setWelcomeHeaderAnimation(rt: RuntimeState, enabled: boolean): void {
  const existing = headerTimers.get(rt);
  if (existing) {
    clearInterval(existing);
    headerTimers.delete(rt);
  }
  if (enabled) {
    headerTimers.set(rt, setInterval(() => rt.tuiRef?.requestRender?.(), 120));
  }
}

export function clearWelcomeHeaderAnimation(rt: RuntimeState): void {
  setWelcomeHeaderAnimation(rt, false);
}

export function dismissWelcome(rt: RuntimeState, ctx: any) {
  rt.welcomeDismissScheduler.cancel();
  clearWelcomeHeaderAnimation(rt);
  rt.refreshWelcomeArt = null;

  if (rt.dismissWelcomeOverlay) {
    rt.dismissWelcomeOverlay();
    rt.dismissWelcomeOverlay = null;
  } else {
    // The startup overlay mounts after a delay; dismiss it immediately if it appears later.
    rt.welcomeOverlayShouldDismiss = true;
  }
  if (rt.welcomeHeaderActive) {
    rt.welcomeHeaderActive = false;
    ctx.ui.setHeader(undefined);
  }
}

export function scheduleDismissWelcome(rt: RuntimeState, ctx: any) {
  if (
    !rt.dismissWelcomeOverlay &&
    rt.welcomeOverlayShouldDismiss &&
    !rt.welcomeHeaderActive
  )
    return;
  rt.welcomeDismissScheduler.schedule(ctx);
}
