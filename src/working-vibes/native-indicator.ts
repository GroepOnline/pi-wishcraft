// native-indicator.ts
// Drives Pi's own working spinner (`ctx.ui.setWorkingIndicator`) from the
// `wishcraft.workingIndicatorStyle` setting and the active motion policy.
// Pi owns the animation timer; this only hands it frames once per run, so it
// never competes with the MotionScheduler and idle sessions cost zero ticks.

import { effectiveLevel, prefersAsciiGlyphs } from "../motion/index.ts";
import type { MotionPolicy } from "../motion/index.ts";
import { hasNerdFonts } from "../theme/icons.ts";
import { nativeWorkingIndicator } from "./frames.ts";
import { vibeState } from "./storage.ts";

type NativeIndicatorUi = {
  setWorkingIndicator?: (options?: { frames?: string[]; intervalMs?: number }) => void;
  theme?: { fg?: (color: any, text: string) => string };
};

export function applyNativeWorkingIndicator(
  ui: NativeIndicatorUi | undefined,
  policy: MotionPolicy,
): void {
  if (!ui?.setWorkingIndicator) return;
  try {
    const { frames, intervalMs } = nativeWorkingIndicator(
      vibeState.config.workingIndicatorStyle,
      effectiveLevel(policy),
      prefersAsciiGlyphs(policy, hasNerdFonts()),
    );
    // Custom frames render verbatim, so colour them like Pi's default spinner.
    const paint = (frame: string): string => {
      try {
        return ui.theme?.fg?.("accent", frame) ?? frame;
      } catch {
        return frame;
      }
    };
    ui.setWorkingIndicator({ frames: frames.map(paint), intervalMs });
  } catch (error) {
    console.debug("[working-vibes] native indicator failed:", error);
  }
}

export function resetNativeWorkingIndicator(ui: NativeIndicatorUi | undefined): void {
  try {
    ui?.setWorkingIndicator?.();
  } catch (error) {
    console.debug("[working-vibes] native indicator reset failed:", error);
  }
}
