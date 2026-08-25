import type { MotionEvent } from "../motion/index.ts";
import { effectiveAppearanceMix, resolveAppearanceMix } from "../config/appearance.ts";
import type { AppearanceMixConfig } from "../config/types.ts";
import { config } from "../extension/core/state.ts";
import type { RuntimeState } from "../extension/core/types.ts";
import { setSignalEvent, stopSignal } from "./controller.ts";

export function dispatchSignalEvent(
  rt: RuntimeState,
  appearance: AppearanceMixConfig,
  event: MotionEvent,
  activity?: string,
): void {
  const resolved = resolveAppearanceMix(
    effectiveAppearanceMix(appearance, config.preset),
  );
  setSignalEvent(rt.signal, rt.motionScheduler, rt.motionPolicy, event, {
    activity,
    motionId: resolved.motion[event] ?? resolved.signal.animation,
    settleMotionId: resolved.motion.idle,
    maxTicks: isFiniteEvent(event) ? 6 : undefined,
    settleOnDone: isTerminalEvent(event),
  });
  rt.lastLayoutResult = null;
  rt.tuiRef?.requestRender();
}

export function settleSignal(rt: RuntimeState): void {
  stopSignal(rt.signal, rt.motionScheduler, rt.motionPolicy);
  rt.lastLayoutResult = null;
  rt.tuiRef?.requestRender();
}

function isFiniteEvent(event: MotionEvent): boolean {
  return (
    event === "tool.end" ||
    event === "idea.capture" ||
    event === "skill.insert" ||
    event === "policy.deny" ||
    isTerminalEvent(event)
  );
}

function isTerminalEvent(event: MotionEvent): boolean {
  return event === "success" || event === "warning" || event === "error";
}
