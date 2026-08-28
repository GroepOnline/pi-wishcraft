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
  /** Motion to restore when a terminal one-shot settles back to semantic idle. */
  settleMotionId?: string;
  /** Finite events stop after this many frames. */
  maxTicks?: number;
  /** Terminal one-shots return to semantic idle when their final frame completes. */
  settleOnDone?: boolean;
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
  // Wrap subscribe so a throw doesn't leave runtime.active=true with
  // release=null (a leaked state that would survive stopSignal).
  let release: (() => void) | null = null;
  try {
    release = scheduler.subscribe({
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
        if (options.settleOnDone) {
          runtime.event = "idle";
          runtime.motionId = options.settleMotionId ?? defaultMotionFor("idle");
          runtime.tick = 0;
          runtime.startedAt = Date.now();
          runtime.activity = "ready";
          runtime.active = false;
        }
      },
    });
  } catch {
    // subscribe failed: reset to idle so stopSignal / the next call can
    // recover cleanly instead of leaving a half-active runtime.
    runtime.active = false;
    runtime.release = null;
    return;
  }
  runtime.release = release;
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
    default:
      // Future events fall back to ready instead of leaking `undefined`
      // into the powerline.
      return "ready";
  }
}
