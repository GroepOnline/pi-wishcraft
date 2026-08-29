/**
 * Studio entrypoint (U5). Non-overlay fullscreen `ctx.ui.custom()`; guards
 * non-TUI modes first. KTD7 boundary: no core/state.ts import — the runtime
 * context arrives via parameters only.
 */

import type { RuntimeState } from "../extension/core/types.ts";
import { createStudioComponent } from "./component.ts";

/**
 * Keep the operator command fail-closed until list/detail/actions/advice are
 * actually wired into the fullscreen component. The scaffold stays available
 * to tests and follow-up implementation without exposing a misleading command.
 */
export const SKILL_STUDIO_PANES_READY = false;

export async function openSkillStudio(
  rt: RuntimeState,
  ctx: any,
): Promise<void> {
  if (!rt.enabled) {
    if (ctx.hasUI) ctx.ui.notify("Skill Studio requires the Signal UI to be enabled", "info");
    return;
  }
  if (!ctx.hasUI) {
    // print/json modes: no interactive surface exists.
    return;
  }
  if (ctx.mode === "rpc") {
    ctx.ui.notify("Skill Studio is not available in RPC mode", "warning");
    return;
  }
  if (!SKILL_STUDIO_PANES_READY) {
    ctx.ui.notify("Skill Studio is not available until its panes are connected", "warning");
    return;
  }

  rt.currentCtx = ctx;

  await ctx.ui.custom(
    (_tui: any, theme: any, _keybindings: any, done: (value: string | null) => void) =>
      createStudioComponent(theme, done),
  );
}
