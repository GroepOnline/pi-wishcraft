export interface AnsiColors {
  getBgAnsi(r: number, g: number, b: number): string;
  getFgAnsi(r: number, g: number, b: number): string;
  getFgAnsi256(code: number): string;
  reset: string;
}

export const ansi: AnsiColors = {
  getBgAnsi: (r, g, b) => `\x1b[48;2;${r};${g};${b}m`,
  getFgAnsi: (r, g, b) => `\x1b[38;2;${r};${g};${b}m`,
  getFgAnsi256: (code) => `\x1b[38;5;${code}m`,
  reset: "\x1b[0m",
};

// ponytail: NO_COLOR (de-facto standard — present and non-empty) disables all
// wishcraft color so the status bar stays plain text in no-color terminals
// and color-blind pipelines. Computed lazily so test env changes take effect.
export function colorEnabled(): boolean {
  const v = process.env.NO_COLOR;
  return !(v != null && v !== "");
}

function hexToRgb(hex: string): [number, number, number] {
  const cleanHex = hex.startsWith("#") ? hex.slice(1) : hex;
  if (!/^[0-9A-Fa-f]{6}$/.test(cleanHex)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return [r, g, b];
}

export const PALETTE: Record<string, string | number> = {
  sep: 244,
  model: "#d787af",
  path: "#00afaf",
  gitClean: "#5faf5f",
  accent: "#febc38",
  queue: "#febc38",
};

type ColorName = keyof typeof PALETTE;

const ansiCodeCache = new Map<string, string>();

function buildAnsiCode(val: string | number | undefined): string {
  if (val === undefined || val === "") return "";
  if (typeof val === "number") return ansi.getFgAnsi256(val);
  if (typeof val === "string" && val.startsWith("#")) {
    const [r, g, b] = hexToRgb(val);
    return ansi.getFgAnsi(r, g, b);
  }
  return "";
}

for (const key of Object.keys(PALETTE)) {
  ansiCodeCache.set(key, buildAnsiCode(PALETTE[key]));
}

export function fgOnly(color: ColorName, text: string): string {
  if (!colorEnabled()) return text;
  const code = ansiCodeCache.get(color as string) ?? "";
  return code ? `${code}${text}` : text;
}

export function getFgAnsiCode(color: ColorName): string {
  if (!colorEnabled()) return "";
  return ansiCodeCache.get(color as string) ?? "";
}

/** Approximate RGB for a 256-color palette code (greyscale + cube). */
function ansi256ToRgb(code: number): [number, number, number] {
  if (code >= 232) {
    const v = 8 + (code - 232) * 10;
    return [v, v, v];
  }
  if (code >= 16) {
    const c = code - 16;
    const step = [0, 95, 135, 175, 215, 255];
    return [step[Math.floor(c / 36) % 6]!, step[Math.floor(c / 6) % 6]!, step[c % 6]!];
  }
  return [128, 128, 128];
}

export function paletteRgb(color: ColorName): [number, number, number] {
  const val = PALETTE[color];
  if (typeof val === "string" && val.startsWith("#")) return hexToRgb(val);
  if (typeof val === "number") return ansi256ToRgb(val);
  return [128, 128, 128];
}

/**
 * Truecolor gradient between two palette tokens. Returns "" when color is
 * disabled so callers paint plain text, exactly like getFgAnsiCode.
 *
 * The mix happens in linear light: sRGB bytes encode intensity
 * non-linearly, so a naive byte lerp makes midpoints look dark and muddy.
 * Decoding to linear light first keeps the perceptual midpoint honest —
 * the wake cools like a glow instead of stepping through tiers.
 */
export function fgGradientCode(
  from: ColorName,
  to: ColorName,
  t: number,
): string {
  if (!colorEnabled()) return "";
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  const a = paletteRgb(from);
  const b = paletteRgb(to);
  return ansi.getFgAnsi(
    Math.round(mixChannel(a[0], b[0], clamped)),
    Math.round(mixChannel(a[1], b[1], clamped)),
    Math.round(mixChannel(a[2], b[2], clamped)),
  );
}

/** sRGB byte -> linear-light intensity (standard EOTF, gamma ≈ 2.2). */
export function srgbToLinear(byte: number): number {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Linear-light intensity -> sRGB byte (rounded to a whole byte). */
export function linearToSrgb(linear: number): number {
  const c = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
  return Math.min(255, Math.max(0, Math.round(c * 255)));
}

function mixChannel(a: number, b: number, t: number): number {
  return linearToSrgb(srgbToLinear(a) + (srgbToLinear(b) - srgbToLinear(a)) * t);
}

type Rgb = [number, number, number];

// ---------------------------------------------------------------------------
// Oklab — perceptually uniform color space (Björn Ottosson's standard).
// Mixing and hue rotation here looks right because distances match what the
// eye sees: midpoints never go muddy and a hue shift lands on a credible
// "cooler" tone instead of a channel-swap guess.
// ---------------------------------------------------------------------------

export interface Oklab {
  L: number;
  a: number;
  b: number;
}

/** sRGB bytes (0..255) -> Oklab. */
export function srgbToOklab(rgb: Rgb): Oklab {
  const [r, g, b] = rgb.map((channel) => srgbToLinear(channel)) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/** Oklab -> sRGB bytes (0..255), clamped to the displayable gamut. */
export function oklabToSrgb({ L, a, b }: Oklab): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const toByte = (linear: number) =>
    Math.min(255, Math.max(0, Math.round(linearToSrgb01(linear))));
  return [
    toByte(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toByte(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toByte(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** Linear-light 0..1 -> sRGB byte fraction 0..255 (unclamped input ok). */
function linearToSrgb01(linear: number): number {
  const c = linear <= 0.0031308 ? linear * 12.92 : 1.055 * Math.max(0, linear) ** (1 / 2.4) - 0.055;
  return c * 255;
}

/** Mix two sRGB colors in Oklab space. */
function mixOklab(from: Rgb, to: Rgb, t: number): Rgb {
  const a = srgbToOklab(from);
  const b = srgbToOklab(to);
  return oklabToSrgb({
    L: a.L + (b.L - a.L) * t,
    a: a.a + (b.a - a.a) * t,
    b: a.b + (b.b - a.b) * t,
  });
}

/**
 * Palette for a motion ramp: the hot head, the warm wake, the cool mid and
 * the track colors. The cool stop is derived in Oklab — rotate the warm
 * hue and dip the lightness slightly — so the wake reads as *cooling*
 * rather than dimming, for every palette, without hardcoding a blue.
 */
export interface MotionRampPalette {
  hot: Rgb;
  warm: Rgb;
  cool: Rgb;
  track: Rgb;
}

/** Cool-stop derivation: hue rotates this far, lightness dips this much. */
const COOL_HUE_SHIFT_DEG = 55;
const COOL_LIGHTNESS_SCALE = 0.94;

export function motionRampPalette(hotToken: ColorName, trackToken: ColorName): MotionRampPalette {
  const hot = paletteRgb(hotToken);
  const track = paletteRgb(trackToken);
  // Warm stop: hot blended 40% toward the track, perceptually mixed.
  const warm = mixOklab(hot, track, 0.4);
  // Cool stop: same chroma family, hue rotated toward the cool side.
  const warmOklab = srgbToOklab(warm);
  const hue = Math.atan2(warmOklab.b, warmOklab.a);
  const chroma = Math.hypot(warmOklab.a, warmOklab.b);
  const shifted = hue + (COOL_HUE_SHIFT_DEG * Math.PI) / 180;
  const cool = oklabToSrgb({
    L: warmOklab.L * COOL_LIGHTNESS_SCALE,
    a: Math.cos(shifted) * chroma,
    b: Math.sin(shifted) * chroma,
  });
  return { hot, warm, cool, track };
}

/**
 * Multi-stop perceptual ramp color for a wake position. `t` is the wake
 * fraction in [0, 1]: 0 at the head, 1 at the track end. The hot→warm leg
 * covers the first 45%, warm→cool the next 35%, cool→track the tail. Every
 * segment mixes in Oklab so lightness falls monotonically and hues glide.
 */
export function motionRampCode(ramp: MotionRampPalette, t: number): string {
  if (!colorEnabled()) return "";
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  const stops: Array<[number, Rgb]> = [
    [0, ramp.hot],
    [0.45, ramp.warm],
    [0.8, ramp.cool],
    [1, ramp.track],
  ];
  let lo = stops[0]!;
  let hi = stops[stops.length - 1]!;
  for (let i = 0; i < stops.length - 1; i++) {
    if (clamped >= stops[i]![0] && clamped <= stops[i + 1]![0]) {
      lo = stops[i]!;
      hi = stops[i + 1]!;
      break;
    }
  }
  const span = hi[0] - lo[0];
  const local = span <= 0 ? 0 : (clamped - lo[0]) / span;
  const [r, g, b] = mixOklab(lo[1], hi[1], local);
  return ansi.getFgAnsi(r, g, b);
}

/**
 * Organic glow falloff for a trail cell: an ease-out decay from the head
 * instead of a linear fade. Brightness lingers near the head and lets go
 * gently — the wake reads as cooling embers rather than a sawtooth ramp.
 */
export function glowFalloff(t: number): number {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return 1 - (1 - clamped) ** 2.2;
}

/**
 * Layered value noise, deterministic in `seed`: three octaves of hashed
 * lattice noise with a moving-phase shimmer. Roughly 0..1. Replaces the
 * old fixed two-sine flicker so ember/heat heads breathe irregularly —
 * like a real flame — while staying perfectly reproducible for tests.
 */
export function valueNoise(seed: number, t: number): number {
  const octaves: Array<[number, number]> = [
    [1.7, 0.55],
    [3.9, 0.3],
    [8.3, 0.15],
  ];
  let sum = 0;
  for (const [freq, amp] of octaves) {
    const x = seed + t * freq;
    const i0 = Math.floor(x);
    const f = x - i0;
    const smooth = f * f * (3 - 2 * f); // smoothstep fade between lattice points
    const a = hash01(i0);
    const b = hash01(i0 + 1);
    sum += amp * (a + (b - a) * smooth);
  }
  return Math.min(1, Math.max(0, sum / (0.55 + 0.3 + 0.15)));
}

/** Deterministic hash of an integer to 0..1 (sin-free, stable across runs). */
function hash01(n: number): number {
  let x = (n | 0) * 374761393 + 668265263;
  x = (x ^ (x >>> 13)) * 1274126177;
  x = x ^ (x >>> 16);
  return (x >>> 0) / 4294967296;
}

/**
 * Ember flicker factor for a flame-lit head: a slow breathing octave plus a
 * fast crackle octave of value noise, normalized to roughly 0..1. Unlike a
 * fixed two-sine curve it never repeats exactly, so the flame stays alive —
 * while remaining a pure function of (seed, time) for deterministic tests.
 */
export function emberFlicker(seed: number, nowMs: number): number {
  const t = nowMs / 1000;
  const slow = valueNoise(seed, t * 0.6);
  const fast = valueNoise(seed + 101, t * 2.4);
  return 0.55 * slow + 0.45 * fast;
}
