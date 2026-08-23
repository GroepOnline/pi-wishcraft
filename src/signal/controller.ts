/**
 * Signal motion controller.
 *
 * It owns no timer. A controller leases one `signal` consumer from the shared
 * MotionScheduler while Pi is active and releases it immediately at rest.
 */

import {
  allowedChannels,
  defaultMotionFor,
  getMotion,
  type MotionEvent,
  type MotionPolicy,
  type MotionScheduler,
} from "../motion/index.ts";

export interface SignalRuntime {
  event: MotionEvent;
  motionId: string;
  tick: number;
  startedAt: number;
  activity: string;
  active: boolean;
  release: (() => void) | null;
}

export function createSignalRuntime(now = Date.now()): SignalRuntime {
  return {
    event: "idle",
    motionId: defaultMotionFor("idle"),
    tick: 0,
    startedAt: now,
    activity: "ready",
    active: false,
    release: null,
  };
}

export interface SetSignalEventOptions {
  activity?: string;
  motionId?: string;
  /** Finite events stop after this many frames. */
  maxTicks?: number;
}

export function setSignalEvent(
  runtime: SignalRuntime,
  scheduler: MotionScheduler,
  policy: MotionPolicy,
  event: MotionEvent,
  options: SetSignalEventOptions = {},
): void {
  runtime.release?.();
  runtime.release = null;
  runtime.event = event;
  runtime.motionId = options.motionId ?? defaultMotionFor(event);
  runtime.tick = 0;
  runtime.startedAt = Date.now();
  runtime.activity = options.activity ?? activityForEvent(event);
  runtime.active = event !== "idle";

  if (
    event === "idle" ||
    !allowedChannels(event, policy).includes("signal")
  ) {
    runtime.active = false;
    return;
  }

  const def = getMotion(runtime.motionId);
  runtime.release = scheduler.subscribe({
    id: "signal-live",
    channel: "signal",
    intervalMs: def?.generator?.intervalMs,
    maxTicks: options.maxTicks,
    onTick(tick) {
      runtime.tick = tick;
    },
    onDone() {
      runtime.release = null;
      if (options.maxTicks !== undefined) runtime.active = false;
    },
  });
}

export function stopSignal(
  runtime: SignalRuntime,
  scheduler: MotionScheduler,
  policy: MotionPolicy,
): void {
  setSignalEvent(runtime, scheduler, policy, "idle");
}

export function activityForEvent(event: MotionEvent): string {
  switch (event) {
    case "idle":
      return "ready";
    case "thinking":
      return "thinking";
    case "streaming":
      return "streaming";
    case "tool.start":
      return "tool";
    case "tool.end":
      return "tool done";
    case "idea.capture":
      return "idea captured";
    case "skill.insert":
      return "skill inserted";
    case "policy.deny":
      return "blocked";
    case "repair":
      return "repairing";
    case "compact":
      return "compacting";
    case "success":
      return "done";
    case "warning":
      return "warning";
    case "error":
      return "error";
  }
}
