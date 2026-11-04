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
  /** EMA over the pairwise output rates — the steady-state estimate. */
  emaOutRate?: number;
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
/** Smoothing factor for the output EMA (0..1; higher = more reactive). */
export const TPS_EMA_ALPHA = 0.32;

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

/** Pairwise buckets for peak/average reporting. */
function pairwiseRates(samples: readonly TpsSample[]): {
  ins: number[];
  outs: number[];
} {
  const ins: number[] = [];
  const outs: number[] = [];
  if (samples.length < 2) return { ins, outs };
  let anchor = samples[0]!;
  for (let i = 1; i < samples.length; i++) {
    const cur = samples[i]!;
    const dtMs = cur.at - anchor.at;
    if (dtMs < TPS_MIN_PAIRWISE_DT_MS) continue;
    const dtSec = dtMs / 1000;
    const dOut = cur.output - anchor.output;
    const dIn = uncachedOf(cur) - uncachedOf(anchor);
    if (dOut > 0) outs.push(dOut / dtSec);
    if (dIn > 0) ins.push(dIn / dtSec);
    anchor = cur;
  }
  return { ins, outs };
}

/** EMA over the pairwise output rates; undefined when nothing was generated. */
function emaOf(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  let ema = values[0]!;
  for (let i = 1; i < values.length; i++) {
    ema = TPS_EMA_ALPHA * values[i]! + (1 - TPS_EMA_ALPHA) * ema;
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

  const { outs } = pairwiseRates(samples);
  return {
    inRate,
    outRate,
    emaOutRate: emaOf(outs),
    ttftMs,
  };
}

function avg(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
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
    emaOutRate: rates.emaOutRate,
    ttftMs: rates.ttftMs,
    peakIn: ins.length ? Math.max(...ins) : 0,
    peakOut: outs.length ? Math.max(...outs) : 0,
    avgIn: avg(ins),
    avgOut: avg(outs),
    samples: samples.length,
  };
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
      summary.emaOutRate === undefined
        ? ""
        : `   ema ${formatTpsRate(summary.emaOutRate)}`
    }`,
    `in   ${formatTpsRate(summary.inRate)}   peak ${formatTpsRate(summary.peakIn)}   avg ${formatTpsRate(summary.avgIn)}`,
  ];
  if (summary.ttftMs !== null && summary.ttftMs !== undefined) {
    lines.push(`ttft ${Math.round(summary.ttftMs)}ms`);
  }
  lines.push(`samples ${summary.samples}`);
  return lines;
}
