/**
 * Shared TPS ring math. Stream events (`message_update`) and the segment both
 * write samples; `/tps` and Status → TPS read the same ring.
 *
 * Three things the plain delta maths got wrong:
 * - prompt tokens arrive once per turn, so a window delta reports the cache
 *   read (or nothing at all) instead of the rate the prompt was processed at;
 * - output arrives in chunks, so a single 1s window is noisy;
 * - a burst that lands right after a repaint looks like thousands of tokens/s.
 * The ring therefore carries the turn start and the uncached input count on a
 * sample, derives TTFT from them, and smooths output with an EMA. All of it
 * lives on the ring: nothing here keeps state beyond the samples themselves.
 */

import { usageSparkline } from "./sparkline.ts";

export interface TpsSample {
  at: number;
  output: number;
  input: number;
  /** Prompt tokens excluding `cacheRead`; falls back to `input`. */
  uncachedInput?: number;
  /**
   * Timestamp (ms) the turn began (`agent_start`). Set on the first sample of
   * a turn only, so the marker identifies where that turn starts in the ring.
   */
  turnStartAt?: number;
}

export interface TpsRates {
  /** Uncached prompt tokens per second; TTFT-based while a turn is active. */
  inRate: number;
  outRate: number;
  /** Continuous-time EMA over output rates — fast burst tracking (~0.8s tau). */
  emaOutFast?: number;
  /** Continuous-time EMA over output rates — steady baseline (~4s tau). */
  emaOutSlow?: number;
  /** Continuous-time EMA over input rates (~4s tau). */
  emaIn?: number;
  /** Time to first token of the current turn; null when no turn is measured. */
  ttftMs?: number | null;
}

export interface TpsSummary extends TpsRates {
  override: string | null;
  windowMs: number;
  peakIn: number;
  peakOut: number;
  avgIn: number;
  avgOut: number;
  /** Output-rate series bucketed per ~500ms, newest last. */
  spark: number[];
  samples: number;
}

export const TPS_MIN_RING_MS = 5000;
export const TPS_MAX_SAMPLES = 480;
/**
 * Pairwise buckets shorter than this are coalesced into the next sample. Two
 * repaints a couple of ms apart that straddle one token burst would otherwise
 * report that burst as thousands of tokens per second.
 */
export const TPS_MIN_PAIRWISE_DT_MS = 80;
/** Samples with identical counts closer together than this carry no signal. */
const TPS_DEDUPE_MS = 40;
/**
 * Continuous-time EMA taus: alpha per observation is 1 − exp(−dtMs/tauMs),
 * so a burst of rapid samples can't over- or under-weight versus sparse ones.
 * Fast tracks the current burst; slow is the smoothed baseline.
 */
export const TPS_EMA_FAST_TAU_MS = 800;
export const TPS_EMA_SLOW_TAU_MS = 4000;
/** Sparkline bucket width for the TPS overlay rate series. */
const TPS_SPARK_BUCKET_MS = 500;

/** Live ring filled by stream events and the tps segment renderer. */
export const tpsSamples: TpsSample[] = [];

export function ringMsForWindow(windowMs: number): number {
  return Math.max(TPS_MIN_RING_MS, windowMs * 2);
}

/** Prompt tokens that actually had to be processed for this sample. */
function uncachedOf(sample: TpsSample): number {
  return sample.uncachedInput ?? sample.input;
}

export function pruneTpsRing(
  samples: TpsSample[],
  now: number,
  ringMs: number,
): void {
  while (samples.length > 0 && now - samples[0]!.at > ringMs) samples.shift();
  if (samples.length > TPS_MAX_SAMPLES) {
    samples.splice(0, samples.length - TPS_MAX_SAMPLES);
  }
}

export function pushTpsSample(
  samples: TpsSample[],
  sample: TpsSample,
  ringMs: number,
): void {
  const tail = samples[samples.length - 1];
  if (
    tail &&
    tail.output === sample.output &&
    tail.input === sample.input &&
    sample.at - tail.at < TPS_DEDUPE_MS
  ) {
    pruneTpsRing(samples, sample.at, ringMs);
    return;
  }
  samples.push(sample);
  pruneTpsRing(samples, sample.at, ringMs);
}

/**
 * Locate the current turn in the ring and the first sample that produced
 * tokens for it. Returns null when no turn marker is present, which is the
 * normal case for a preset that never streams (`/tps` alone, replay, tests).
 */
function measureTurn(samples: readonly TpsSample[]): {
  turnStartAt: number;
  firstTokenAt: number;
  baseInput: number;
  baseOutput: number;
} | null {
  let marker = -1;
  for (let i = samples.length - 1; i >= 0; i--) {
    if (samples[i]!.turnStartAt !== undefined) {
      marker = i;
      break;
    }
  }
  if (marker < 0) return null;

  const start = samples[marker]!.turnStartAt!;
  const before = samples[marker - 1];
  const baseInput = before ? uncachedOf(before) : 0;
  const baseOutput = before ? before.output : 0;

  for (let i = marker; i < samples.length; i++) {
    const cur = samples[i]!;
    if (cur.output > baseOutput || uncachedOf(cur) > baseInput) {
      return {
        turnStartAt: start,
        firstTokenAt: cur.at,
        baseInput,
        baseOutput,
      };
    }
  }
  return null;
}

interface RateObservation {
  rate: number;
  atMs: number;
  dtMs: number;
}

/** Pairwise buckets for peak/average reporting and time-weighted EMAs. */
function pairwiseRates(samples: readonly TpsSample[]): {
  ins: RateObservation[];
  outs: RateObservation[];
  outsForEma: RateObservation[];
} {
  const ins: RateObservation[] = [];
  const outs: RateObservation[] = [];
  const outsForEma: RateObservation[] = [];
  if (samples.length < 2) return { ins, outs, outsForEma };
  let anchor = samples[0]!;
  for (let i = 1; i < samples.length; i++) {
    const cur = samples[i]!;
    const dtMs = cur.at - anchor.at;
    if (dtMs < TPS_MIN_PAIRWISE_DT_MS) continue;
    const dtSec = dtMs / 1000;
    const dOut = cur.output - anchor.output;
    const dIn = uncachedOf(cur) - uncachedOf(anchor);
    if (dOut > 0) outs.push({ rate: dOut / dtSec, atMs: cur.at, dtMs });
    // Silent intervals still carry real elapsed time — the EMA needs them to
    // decay during a pause instead of holding the burst rate indefinitely.
    outsForEma.push({
      rate: Math.max(0, dOut) / dtSec,
      atMs: cur.at,
      dtMs,
    });
    if (dIn > 0) ins.push({ rate: dIn / dtSec, atMs: cur.at, dtMs });
    anchor = cur;
  }
  return { ins, outs, outsForEma };
}

/**
 * Continuous-time EMA over observations with real dt between them:
 * alpha = 1 − exp(−dtMs/tauMs). Undefined when there is nothing to smooth.
 */
function emaOverTime(
  observations: readonly RateObservation[],
  tauMs: number,
): number | undefined {
  if (observations.length === 0) return undefined;
  let ema = observations[0]!.rate;
  for (let i = 1; i < observations.length; i++) {
    const prev = observations[i - 1]!;
    const curr = observations[i]!;
    const elapsedMs = Math.max(1, curr.atMs - prev.atMs, curr.dtMs);
    const alpha = 1 - Math.exp(-elapsedMs / tauMs);
    ema = alpha * curr.rate + (1 - alpha) * ema;
  }
  return ema;
}

export interface TpsUsage {
  input: number;
  output: number;
  /** Cached prompt tokens to exclude from the processed-input rate. */
  cacheRead?: number;
}

export function ratesFromRing(
  samples: readonly TpsSample[],
  now: number,
  usage: TpsUsage,
  windowMs: number,
): TpsRates {
  let ref: TpsSample | null = null;
  let bestDelta = Infinity;
  const minAge = windowMs / 2;
  for (const s of samples) {
    const age = now - s.at;
    if (age < minAge) continue;
    const d = Math.abs(age - windowMs);
    if (d < bestDelta) {
      bestDelta = d;
      ref = s;
    }
  }

  let outRate = 0;
  let windowInRate = 0;
  if (ref) {
    const dt = (now - ref.at) / 1000;
    const dOut = usage.output - ref.output;
    const dIn = usage.input - ref.input;
    if (dt > 0 && dOut > 0) outRate = dOut / dt;
    if (dt > 0 && dIn > 0) windowInRate = dIn / dt;
  }

  const turn = measureTurn(samples);
  let ttftMs: number | null = null;
  let inRate = windowInRate;
  if (turn) {
    // Prompt processing happens once, up front: its rate is the uncached
    // token count over the time it took to produce the first token. Dividing
    // it by the 1s window (and counting cacheRead) is what produced the
    // nonsense input rates this replaces.
    ttftMs = Math.max(1, turn.firstTokenAt - turn.turnStartAt);
    const processed = Math.max(
      0,
      usage.input - (usage.cacheRead ?? 0) - turn.baseInput,
    );
    inRate = processed > 0 ? processed / (ttftMs / 1000) : 0;
  }

  const { ins, outsForEma } = pairwiseRates(samples);
  return {
    inRate,
    outRate,
    emaOutFast: emaOverTime(outsForEma, TPS_EMA_FAST_TAU_MS),
    emaOutSlow: emaOverTime(outsForEma, TPS_EMA_SLOW_TAU_MS),
    emaIn: emaOverTime(ins, TPS_EMA_SLOW_TAU_MS),
    ttftMs,
  };
}

function avgObs(values: readonly RateObservation[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b.rate, 0) / values.length;
}

export function summarizeTpsRing(
  samples: readonly TpsSample[],
  now: number,
  usage: TpsUsage,
  options: { windowMs?: number; override?: string | null } = {},
): TpsSummary {
  const windowMs = options.windowMs ?? 1000;
  const override = options.override?.trim() || null;
  const rates = ratesFromRing(samples, now, usage, windowMs);
  const { ins, outs } = pairwiseRates(samples);
  return {
    override,
    windowMs,
    inRate: rates.inRate,
    outRate: rates.outRate,
    emaOutFast: rates.emaOutFast,
    emaOutSlow: rates.emaOutSlow,
    emaIn: rates.emaIn,
    ttftMs: rates.ttftMs,
    peakIn: ins.length ? Math.max(...ins.map((o) => o.rate)) : 0,
    peakOut: outs.length ? Math.max(...outs.map((o) => o.rate)) : 0,
    avgIn: avgObs(ins),
    avgOut: avgObs(outs),
    samples: samples.length,
    spark: tpsRateSeries(outs, now),
  };
}

/** Output-rate series bucketed at the sparkline interval, newest last. */
function tpsRateSeries(
  outs: readonly RateObservation[],
  nowMs?: number,
): number[] {
  if (outs.length === 0) return [];
  const endMs = nowMs ?? outs[outs.length - 1]!.atMs;
  const firstObsStartMs = Math.min(
    ...outs.map((o) => o.atMs - Math.max(0, o.dtMs)),
  );
  const startMs = Math.max(firstObsStartMs, endMs - TPS_SPARK_BUCKET_MS * 40);
  if (endMs <= startMs) return [outs[outs.length - 1]!.rate];

  const bucketCount = Math.max(1, Math.ceil((endMs - startMs) / TPS_SPARK_BUCKET_MS));
  const weightedSum = Array.from({ length: bucketCount }, () => 0);
  const overlapWeight = Array.from({ length: bucketCount }, () => 0);

  for (const obs of outs) {
    const obsEnd = obs.atMs;
    const obsStart = obs.atMs - Math.max(1, obs.dtMs);
    if (obsEnd <= startMs || obsStart >= endMs) continue;

    const clampedStart = Math.max(startMs, obsStart);
    const clampedEnd = Math.min(endMs, obsEnd);
    const firstBucket = Math.max(
      0,
      Math.floor((clampedStart - startMs) / TPS_SPARK_BUCKET_MS),
    );
    const lastBucket = Math.min(
      bucketCount - 1,
      Math.floor((clampedEnd - 1 - startMs) / TPS_SPARK_BUCKET_MS),
    );

    for (let b = firstBucket; b <= lastBucket; b++) {
      const bStart = startMs + b * TPS_SPARK_BUCKET_MS;
      const bEnd = Math.min(endMs, bStart + TPS_SPARK_BUCKET_MS);
      const overlap =
        Math.max(0, Math.min(clampedEnd, bEnd) - Math.max(clampedStart, bStart));
      if (overlap > 0) {
        weightedSum[b]! += obs.rate * overlap;
        overlapWeight[b]! += overlap;
      }
    }
  }

  return weightedSum.map((sum, b) =>
    overlapWeight[b]! > 0 ? sum / overlapWeight[b]! : 0,
  );
}

export function formatTpsRate(rate: number): string {
  return rate >= 100 ? Math.round(rate).toString() : rate.toFixed(1);
}

export function tpsOverlayLines(summary: TpsSummary): string[] {
  if (summary.override) {
    return [
      `override ${summary.override}`,
      "clear with Configure or /tps (empty to show live)",
    ];
  }
  const lines = [
    `window ${summary.windowMs}ms over ${TPS_MIN_RING_MS}ms ring`,
    `out  ${formatTpsRate(summary.outRate)}   peak ${formatTpsRate(summary.peakOut)}   avg ${formatTpsRate(summary.avgOut)}${
      summary.emaOutFast === undefined
        ? ""
        : `   ema ${formatTpsRate(summary.emaOutFast)}/${formatTpsRate(summary.emaOutSlow ?? 0)}`
    }`,
    `in   ${formatTpsRate(summary.inRate)}   peak ${formatTpsRate(summary.peakIn)}   avg ${formatTpsRate(summary.avgIn)}${
      summary.emaIn === undefined
        ? ""
        : `   ema ${formatTpsRate(summary.emaIn)}`
    }`,
    `spark ${usageSparkline(summary.spark)}`,
  ];
  if (summary.ttftMs !== null && summary.ttftMs !== undefined) {
    lines.push(`ttft ${Math.round(summary.ttftMs)}ms`);
  }
  lines.push(`samples ${summary.samples}`);
  return lines;
}
