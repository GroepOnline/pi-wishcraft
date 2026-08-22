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
let _colorEnabled: boolean | undefined;
export function colorEnabled(): boolean {
  if (_colorEnabled === undefined) {
    const v = process.env.NO_COLOR;
    _colorEnabled = !(v != null && v !== "");
  }
  return _colorEnabled;
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
