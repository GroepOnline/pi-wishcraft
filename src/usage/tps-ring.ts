/**
 * Shared TPS ring math. The segment writes samples; `/tps` and Status → TPS
 * read the same ring. No second sampler.
 */

export interface TpsSample {
  at: number;
  output: number;
  input: number;
}

export interface TpsRates {
  inRate: number;
  outRate: number;
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

/** Live ring filled by the tps segment renderer. */
export const tpsSamples: TpsSample[] = [];

export function ringMsForWindow(windowMs: number): number {
  return Math.max(TPS_MIN_RING_MS, windowMs * 2);
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
  samples.push(sample);
  pruneTpsRing(samples, sample.at, ringMs);
}

export function ratesFromRing(
  samples: readonly TpsSample[],
  now: number,
  usage: { input: number; output: number },
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
  let inRate = 0;
  if (ref) {
    const dt = (now - ref.at) / 1000;
    const dOut = usage.output - ref.output;
    const dIn = usage.input - ref.input;
    if (dt > 0 && dOut >= 0) outRate = dOut / dt;
    if (dt > 0 && dIn >= 0) inRate = dIn / dt;
  }
  return { inRate, outRate };
}

function pairwiseRates(samples: readonly TpsSample[]): {
  ins: number[];
  outs: number[];
} {
  const ins: number[] = [];
  const outs: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1]!;
    const cur = samples[i]!;
    const dt = (cur.at - prev.at) / 1000;
    if (dt <= 0) continue;
    const dOut = cur.output - prev.output;
    const dIn = cur.input - prev.input;
    if (dOut >= 0) outs.push(dOut / dt);
    if (dIn >= 0) ins.push(dIn / dt);
  }
  return { ins, outs };
}

function avg(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function summarizeTpsRing(
  samples: readonly TpsSample[],
  now: number,
  usage: { input: number; output: number },
  options: { windowMs?: number; override?: string | null } = {},
): TpsSummary {
  const windowMs = options.windowMs ?? 1000;
  const override = options.override?.trim() || null;
  const { inRate, outRate } = ratesFromRing(samples, now, usage, windowMs);
  const { ins, outs } = pairwiseRates(samples);
  return {
    override,
    windowMs,
    inRate,
    outRate,
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
  return [
    `window ${summary.windowMs}ms over ${TPS_MIN_RING_MS}ms ring`,
    `out  ${formatTpsRate(summary.outRate)}   peak ${formatTpsRate(summary.peakOut)}   avg ${formatTpsRate(summary.avgOut)}`,
    `in   ${formatTpsRate(summary.inRate)}   peak ${formatTpsRate(summary.peakIn)}   avg ${formatTpsRate(summary.avgIn)}`,
    `samples ${summary.samples}`,
  ];
}
