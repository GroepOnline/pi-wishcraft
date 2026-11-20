/**
 * Per-style RGB. Catalog `speed` drives travel / hue / breathe rate;
 * intensity drives amplitude, band width, and contrast.
 */

import type { MotionIntensity, MotionStyleId } from "./types.ts";

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpRgb(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  t: number,
): [number, number, number] {
  const u = Math.max(0, Math.min(1, t));
  return [lerp(from[0], to[0], u), lerp(from[1], to[1], u), lerp(from[2], to[2], u)];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) {
    r = c;
    g = x;
  } else if (hue < 120) {
    r = x;
    g = c;
  } else if (hue < 180) {
    g = c;
    b = x;
  } else if (hue < 240) {
    g = x;
    b = c;
  } else if (hue < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function headPosition(now: number, count: number, speed: number): number {
  if (count <= 0) return 0;
  return ((now * Math.max(0.05, speed)) / 16) % count;
}

function wrapHead(head: number, n: number): number {
  return ((head % n) + n) % n;
}

function wrapDist(i: number, head: number, n: number): number {
  if (n <= 0) return 0;
  const h = wrapHead(head, n);
  const d = Math.abs(i - h);
  return Math.min(d, n - d);
}

function trailBehind(i: number, head: number, n: number): number {
  if (n <= 0) return 0;
  let d = wrapHead(head, n) - i;
  if (d < 0) d += n;
  return d;
}

function flicker(now: number, i: number, speed: number): number {
  const cell = Math.floor(now * 0.014 * speed) + i * 17;
  const x = Math.sin(cell * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function ampOf(intensity: MotionIntensity): number {
  return 0.42 + intensity * 0.14;
}

type StylePaint = (
  i: number,
  n: number,
  now: number,
  intensity: MotionIntensity,
  speed: number,
) => [number, number, number];

const STYLE_PAINT: Record<MotionStyleId, StylePaint> = {
  shimmer(i, n, now, intensity, speed) {
    const head = headPosition(now, n, speed);
    const width = 2.2 + intensity * 1.45;
    const peak = Math.max(0, 1 - wrapDist(i, head, n) / width) ** 0.42;
    const stitch = intensity <= 2 && i % 2 === 1 ? 0.4 : 1;
    return lerpRgb(
      [58, 42, 74],
      [255, 236, 142],
      peak * stitch * Math.min(1, ampOf(intensity) * 1.15),
    );
  },
  rainbow(i, n, now, intensity, speed) {
    const hue = (i / n) * 360 + now * 0.16 * speed;
    const sat = 0.82 + intensity * 0.028;
    const light =
      0.5 + intensity * 0.018 + 0.07 * Math.sin(now * 0.007 * speed + i * 0.15);
    return hslToRgb(hue, Math.min(0.95, sat), light);
  },
  ember(i, n, now, intensity, speed) {
    const head = headPosition(now, n, speed);
    const tail = 5.5 + intensity * 3.2;
    const t = Math.exp(-trailBehind(i, head, n) / tail);
    const spark = 0.72 + 0.28 * flicker(now, i, speed);
    return lerpRgb(
      [92, 18, 8],
      [255, 198, 58],
      t * spark * Math.min(1, ampOf(intensity) * 1.2),
    );
  },
  heat(i, n, now, intensity, speed) {
    const head = headPosition(now, n, speed);
    const dist = wrapDist(i, head, n);
    const width = 4.2 + intensity * 2.4;
    const core = Math.max(0, 1 - dist / Math.max(1.1, width * 0.32)) ** 0.45;
    const bloom = Math.max(0, 1 - dist / width) ** 1.15;
    const t = Math.max(core, bloom * 0.72) * Math.min(1, ampOf(intensity) * 1.15);
    return lerpRgb([86, 6, 16], [255, 246, 220], t);
  },
  aurora(i, n, now, intensity, speed) {
    const wash = (Math.sin(i * 0.36 + now * 0.0036 * speed) + 1) / 2;
    const veil = (Math.sin(i * 0.15 - now * 0.0021 * speed + 1.8) + 1) / 2;
    const mix = wash * 0.58 + veil * 0.42;
    const cool = lerpRgb([8, 36, 88], [20, 140, 168], mix);
    const hot = lerpRgb([20, 140, 168], [150, 255, 214], mix);
    return lerpRgb(cool, hot, mix * ampOf(intensity));
  },
  comet(i, n, now, intensity, speed) {
    const head = headPosition(now, n, speed);
    const behind = trailBehind(i, head, n);
    const tau = 3.2 + intensity * 2.6;
    const t = Math.exp(-behind / tau);
    const headGlow = behind < 0.85 ? 1 : t;
    return lerpRgb(
      [14, 12, 42],
      [244, 248, 255],
      headGlow * Math.min(1, ampOf(intensity) * 1.25),
    );
  },
  prism(i, n, now, intensity, speed) {
    const split = i * 2 < n;
    const drift = now * 0.11 * speed;
    const twist = i * (0.9 + speed * 0.35) + (i % 2) * 18;
    const hue = (split ? 195 : 28) + drift + twist * 0.35;
    const light =
      0.5 + 0.08 * Math.sin(i * 0.7 + now * 0.005 * speed) + intensity * 0.02;
    return hslToRgb(hue, 0.8, light);
  },
  tide(i, n, now, intensity, speed) {
    const travel = ((Math.sin(now * 0.0038 * speed) + 1) / 2) * (n - 1);
    const crest = 2.6 + intensity * 1.1;
    const t = Math.max(
      Math.max(0, 1 - wrapDist(i, travel, n) / crest),
      Math.max(0, 1 - wrapDist(i, n - 1 - travel, n) / crest),
      ((Math.sin(i * 0.22 - now * 0.0055 * speed) + 1) / 2) * 0.28,
    );
    return lerpRgb([16, 40, 128], [190, 232, 255], t * Math.min(1, ampOf(intensity) * 1.2));
  },
  pulse(_i, _n, now, intensity, speed) {
    const breathe = (Math.sin(now * 0.0034 * speed) + 1) / 2;
    return lerpRgb([62, 62, 84], [238, 228, 255], 0.1 + breathe * ampOf(intensity));
  },
};

export function colorForStyle(
  style: MotionStyleId,
  i: number,
  count: number,
  now: number,
  intensity: MotionIntensity,
  speed: number,
): [number, number, number] {
  return STYLE_PAINT[style](i, Math.max(1, count), now, intensity, speed);
}
