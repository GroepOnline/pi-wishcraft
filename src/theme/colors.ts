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
    Math.round(a[0] + (b[0] - a[0]) * clamped),
    Math.round(a[1] + (b[1] - a[1]) * clamped),
    Math.round(a[2] + (b[2] - a[2]) * clamped),
  );
}
