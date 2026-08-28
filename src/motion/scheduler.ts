/**
 * scheduler.ts
 * ---------------------------------------------------------------------------
 * One clock for every animation in Wishcraft. Components subscribe a consumer
 * per channel and receive tick numbers; they never own a timer themselves.
 *
 * Built on the existing coalescing timer, so a frame is a single scheduled
 * render rather than an always-on interval. When the last consumer leaves, the
 * timer is cancelled: an idle session costs zero frames.
 * ---------------------------------------------------------------------------
 */

import { createCoalescingTimer, type RenderScheduler } from "../render/timer.ts";
import { CADENCE_MS, PREVIEW_INTERVAL_MS } from "./catalog.ts";
import type { MotionChannel } from "./types.ts";

export interface MotionConsumer {
  /** Stable id; re-subscribing with the same id replaces the consumer. */
  id: string;
  channel: MotionChannel;
  /** Gallery previews may run hotter than production channels. */
  preview?: boolean;
  /** Interval override in ms; clamped to the channel's documented band. */
  intervalMs?: number;
  /** Finite motions stop themselves after this many ticks. */
  maxTicks?: number;
  onTick(tick: number, now: number): void;
  onDone?(): void;
}

export interface MotionSchedulerOptions {
  /** Ask the host to repaint after a batch of ticks. */
  requestRender(): void;
  /** Injectable for tests. Defaults to the shared coalescing timer. */
  createTimer?(render: () => void, defaultDelayMs: number): RenderScheduler;
  /** Injectable clock for tests. */
  now?(): number;
}

const DEFAULT_DELAY_MS = 90;

export class MotionScheduler {
  private readonly consumers = new Map<string, MotionConsumer>();
  private readonly ticks = new Map<string, number>();
  private readonly due = new Map<string, number>();
  private readonly timer: RenderScheduler;
  private readonly now: () => number;
  private readonly requestRender: () => void;
  private armed = false;

  constructor(options: MotionSchedulerOptions) {
    this.now = options.now ?? (() => Date.now());
    this.requestRender = options.requestRender;
    const create = options.createTimer ?? createCoalescingTimer;
    this.timer = create(() => this.tick(), DEFAULT_DELAY_MS);
  }

  /** Subscribe a consumer and return its unsubscribe function. */
  subscribe(consumer: MotionConsumer): () => void {
    const existing = this.consumers.get(consumer.id);
    if (existing) {
      // Defensive: re-subscribing with the same id without an explicit
      // release leaks the old consumer's onDone. Call it here so the
      // contract is safe even if the caller forgets to release first.
      existing.onDone?.();
    }
    this.consumers.set(consumer.id, consumer);
    this.ticks.set(consumer.id, 0);
    this.due.set(consumer.id, this.now() + intervalFor(consumer));
    this.arm();
    return () => this.release(consumer.id);
  }

  /** Number of subscribed consumers. Zero means the clock is stopped. */
  get activeCount(): number {
    return this.consumers.size;
  }

  /** True while a frame is scheduled. */
  get running(): boolean {
    return this.armed;
  }

  /** Channels something is currently rendering. */
  activeChannels(): MotionChannel[] {
    return [...new Set([...this.consumers.values()].map((consumer) => consumer.channel))];
  }

  /** Delay until the next frame, or null when nothing is subscribed. */
  nextDelay(): number | null {
    if (this.consumers.size === 0) return null;
    const now = this.now();
    let soonest = Number.POSITIVE_INFINITY;
    for (const consumer of this.consumers.values()) {
      const due = this.due.get(consumer.id) ?? now;
      soonest = Math.min(soonest, Math.max(0, due - now));
    }
    return soonest === Number.POSITIVE_INFINITY ? null : soonest;
  }

  /** Drop every consumer and cancel the clock. */
  dispose(): void {
    this.consumers.clear();
    this.ticks.clear();
    this.due.clear();
    this.stop();
  }

  private release(id: string): void {
    const consumer = this.consumers.get(id);
    this.consumers.delete(id);
    this.ticks.delete(id);
    this.due.delete(id);
    consumer?.onDone?.();
    if (this.consumers.size === 0) this.stop();
  }

  private arm(): void {
    const delay = this.nextDelay();
    if (delay === null) return;
    this.armed = true;
    this.timer.schedule(delay);
  }

  private stop(): void {
    this.armed = false;
    this.timer.cancel();
  }

  private tick(): void {
    this.armed = false;
    if (this.consumers.size === 0) return;

    const now = this.now();
    let painted = 0;
    const finished: string[] = [];

    for (const consumer of this.consumers.values()) {
      const due = this.due.get(consumer.id) ?? now;
      if (now < due) continue;

      const tick = (this.ticks.get(consumer.id) ?? 0) + 1;
      this.ticks.set(consumer.id, tick);
      this.due.set(consumer.id, now + intervalFor(consumer));
      consumer.onTick(tick, now);
      painted += 1;

      if (consumer.maxTicks !== undefined && tick >= consumer.maxTicks) {
        finished.push(consumer.id);
      }
    }

    for (const id of finished) this.release(id);
    if (painted > 0) this.requestRender();
    if (this.consumers.size > 0) this.arm();
  }
}

function intervalFor(consumer: MotionConsumer): number {
  if (consumer.preview) return PREVIEW_INTERVAL_MS;
  const band = CADENCE_MS[consumer.channel];
  if (consumer.intervalMs === undefined) {
    return Math.round((band.min + band.max) / 2);
  }
  return Math.min(band.max, Math.max(band.min, consumer.intervalMs));
}
