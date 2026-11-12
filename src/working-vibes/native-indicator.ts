// native-indicator.ts
// Drives Pi's own working spinner (`ctx.ui.setWorkingIndicator`) from the
// `wishcraft.workingIndicatorStyle` setting and the active motion policy.
// Pi owns the animation timer; this only hands it frames once per run, so it
// never competes with the MotionScheduler and idle sessions cost zero ticks.

import { effectiveLevel, framesOf, getMotion, prefersAsciiGlyphs } from "../motion/index.ts";
import type { MotionPolicy } from "../motion/index.ts";
import { hasNerdFonts } from "../theme/icons.ts";
import { nativeWorkingIndicator } from "./frames.ts";
import type { NativeIndicatorSpec } from "./frames.ts";
import { vibeState } from "./storage.ts";
import { debugLog } from "../extension/core/debug-log.ts";

type NativeIndicatorUi = {
  setWorkingIndicator?: (options?: { frames?: string[]; intervalMs?: number }) => void;
  theme?: { fg?: (color: "accent", text: string) => string };
};

/**
 * Catalog frames for the `motion` style. Resolved from the Motion Catalog so
 * the native spinner runs the same glyphs as the status rail instead of a
 * second, divergent animation.
 */
function motionSpec(motionId: string | undefined): NativeIndicatorSpec | undefined {
  if (!motionId) return undefined;
  const def = getMotion(motionId);
  if (!def) return undefined;
  const frames = framesOf(def);
  if (frames.length === 0) return undefined;
  return { frames: [...frames], intervalMs: def.generator?.intervalMs ?? 100 };
}

export function applyNativeWorkingIndicator(
  ui: NativeIndicatorUi | undefined,
  policy: MotionPolicy,
  activeMotionId?: string,
): void {
  if (!ui?.setWorkingIndicator) return;
  try {
    const level = effectiveLevel(policy);
    const ascii = prefersAsciiGlyphs(policy, hasNerdFonts());
    const style = vibeState.config.workingIndicatorStyle;
    const spec = nativeWorkingIndicator(
      style,
      level,
      ascii,
      style === "motion" && !ascii && level === "full"
        ? motionSpec(activeMotionId)
        : undefined,
    );
    // Custom frames render verbatim, so colour them like Pi's default spinner.
    const paint = (frame: string): string => {
      try {
        return ui.theme?.fg?.("accent", frame) ?? frame;
      } catch {
        return frame;
      }
    };
    ui.setWorkingIndicator({ frames: spec.frames.map(paint), intervalMs: spec.intervalMs });
  } catch (error) {
    debugLog("[working-vibes] native indicator failed:", error);
  }
}

export function resetNativeWorkingIndicator(ui: NativeIndicatorUi | undefined): void {
  try {
    ui?.setWorkingIndicator?.();
  } catch (error) {
    debugLog("[working-vibes] native indicator reset failed:", error);
  }
}
