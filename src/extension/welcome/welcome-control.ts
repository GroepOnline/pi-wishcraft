import type { RuntimeState } from "../core/types.ts";

export function dismissWelcome(rt: RuntimeState, ctx: any) {
  rt.welcomeDismissScheduler.cancel();

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
