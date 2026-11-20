/**
 * Powerline paint runtime: keyword burst/hold + thinking/catalog paint on the
 * composed status line. Owns no timer — while paint is needed it leases a
 * consumer on the shared MotionScheduler; at idle the lease is dropped and
 * the clock may stop entirely.
 */

import { colorEnabled } from "../theme/colors.ts";
import {
  getMotionPaintEntry,
  isMotionPaintId,
  parseThinkingLevel,
  thinkingMotion,
  type MotionPaintEntry,
} from "./paint-catalog.ts";
import { matchKeyword } from "./keywords.ts";
import { motionPaintAllowed } from "./policy.ts";
import { applyKeywordSpan, applyMotionStyle } from "./primitives.ts";
import type {
  KeywordHit,
  MotionIntensity,
  MotionPolicy,
  MotionPaint,
  MotionSettings,
  PowerlinePaint,
} from "./types.ts";
import { DEFAULT_MOTION_POLICY, KEYWORD_BURST_MS, KEYWORD_BURST_SPEED, PAINT_TICK_MS } from "./types.ts";
import type { MotionScheduler } from "./scheduler.ts";

export const NONE_PAINT = { kind: "none" } as const satisfies MotionPaint;

export interface ResolveMotionPaintInput {
  settings: MotionSettings;
  streaming: boolean;
  thinkingLevel: string | null;
  keyword: KeywordHit | null;
  burstUntil: number;
  now: number;
  env?: NodeJS.ProcessEnv;
  color?: boolean;
  policy?: MotionPolicy;
}

function bumpIntensity(intensity: MotionIntensity): MotionIntensity {
  return intensity >= 5 ? 5 : ((intensity + 1) as MotionIntensity);
}

function entryFromId(id: string): MotionPaintEntry {
  if (isMotionPaintId(id)) return getMotionPaintEntry(id);
  return getMotionPaintEntry("shimmer-work");
}

function catalogPaint(entry: MotionPaintEntry): MotionPaint {
  return {
    kind: "catalog",
    style: entry.style,
    intensity: entry.intensity,
    speed: entry.speed,
    paintId: entry.id,
  };
}

/**
 * Pure paint resolver. Keyword hold/burst wins, then thinking while
 * streaming, then the default working shimmer, else none.
 */
export function resolveMotionPaint(input: ResolveMotionPaintInput): MotionPaint {
  const env = input.env ?? process.env;
  const color = input.color ?? colorEnabled();
  if (!motionPaintAllowed(input.settings, env, color, input.policy)) {
    return NONE_PAINT;
  }

  if (input.settings.keywords && input.keyword) {
    const entry = entryFromId(input.keyword.paintId);
    const burst = input.now < input.burstUntil;
    return {
      kind: "keyword",
      style: entry.style,
      intensity: burst ? bumpIntensity(entry.intensity) : entry.intensity,
      speed: burst ? entry.speed * KEYWORD_BURST_SPEED : entry.speed,
      paintId: entry.id,
      keyword: input.keyword,
      burst,
    };
  }

  if (input.streaming) {
    const thinking = parseThinkingLevel(input.thinkingLevel);
    const entry = thinking ? thinkingMotion(thinking) : null;
    if (entry) return catalogPaint(entry);
    return catalogPaint(getMotionPaintEntry("shimmer-work"));
  }

  return NONE_PAINT;
}

export function decoratePowerlineLine(
  text: string,
  paint: MotionPaint,
  now: number,
): string {
  if (!text || paint.kind === "none") return text;
  return applyMotionStyle(text, paint.style, paint.intensity, now, paint.speed);
}

export function decorateKeywordLine(
  text: string,
  settings: MotionSettings,
  now: number,
  env?: NodeJS.ProcessEnv,
  color?: boolean,
  policy?: MotionPolicy,
): string {
  if (!text) return text;
  const envOf = env ?? process.env;
  const colorOn = color ?? colorEnabled();
  if (
    !motionPaintAllowed(settings, envOf, colorOn, policy ?? DEFAULT_MOTION_POLICY) ||
    !settings.keywords
  ) {
    return text;
  }
  const hit = matchKeyword(text);
  if (!hit) return text;
  const entry = entryFromId(hit.paintId);
  return applyKeywordSpan(
    text,
    hit.index,
    hit.length,
    entry.style,
    entry.intensity,
    now,
    entry.speed,
  );
}

export interface PowerlinePaintOptions {
  scheduler: MotionScheduler;
  getStreaming: () => boolean;
  getThinkingLevel: () => string | null;
  getPolicy?: () => MotionPolicy;
  now?: () => number;
  color?: () => boolean;
  env?: () => NodeJS.ProcessEnv;
}

const CONSUMER_ID = "powerline-paint";

export function createPowerlinePaint(
  opts: PowerlinePaintOptions,
): PowerlinePaint {
  let settings: MotionSettings = { enabled: true, keywords: true };
  let keyword: KeywordHit | null = null;
  let lastKeywordId: string | null = null;
  let burstUntil = 0;
  let release: (() => void) | null = null;
  const clock = opts.now ?? Date.now;
  const colorOn = opts.color ?? colorEnabled;
  const envOf = opts.env ?? ((): NodeJS.ProcessEnv => process.env);
  const policyOf = opts.getPolicy ?? ((): MotionPolicy => DEFAULT_MOTION_POLICY);

  function needsPaint(): boolean {
    if (!motionPaintAllowed(settings, envOf(), colorOn(), policyOf())) {
      return false;
    }
    if (settings.keywords && keyword !== null) return true;
    return opts.getStreaming();
  }

  function sync(): void {
    const need = needsPaint();
    if (need && release === null) {
      release = opts.scheduler.subscribe({
        id: CONSUMER_ID,
        channel: "signal",
        intervalMs: PAINT_TICK_MS,
        // The lease only needs to exist: the scheduler drives the repaint.
        onTick: () => undefined,
      });
      return;
    }
    if (!need && release !== null) {
      release();
      release = null;
    }
  }

  return {
    noteText(text: string) {
      const now = clock();
      const hit = matchKeyword(text);
      if (hit) {
        if (hit.id !== lastKeywordId && settings.keywords) {
          burstUntil = now + KEYWORD_BURST_MS;
        }
        lastKeywordId = hit.id;
      } else {
        lastKeywordId = null;
        burstUntil = 0;
      }
      keyword = hit;
      sync();
    },
    setSettings(next: MotionSettings) {
      settings = { enabled: next.enabled, keywords: next.keywords };
      if (!settings.keywords) burstUntil = 0;
      sync();
    },
    getSettings() {
      return { enabled: settings.enabled, keywords: settings.keywords };
    },
    getPaint(now = clock()) {
      return resolveMotionPaint({
        settings,
        streaming: opts.getStreaming(),
        thinkingLevel: opts.getThinkingLevel(),
        keyword,
        burstUntil,
        now,
        env: envOf(),
        color: colorOn(),
        policy: policyOf(),
      });
    },
    sync,
    reset() {
      keyword = null;
      lastKeywordId = null;
      burstUntil = 0;
      if (release !== null) {
        release();
        release = null;
      }
    },
  };
}
