import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getAgentPath } from "../paths/agent-dirs.ts";
import type {
  ColorScheme,
  ColorValue,
  SemanticColor,
  ThemeLike,
} from "../config/types.ts";

export interface PowerlineThemeConfig {
  colors?: unknown;
  icons?: unknown;
}

const DEFAULT_COLORS: Required<ColorScheme> = {
  model: "#d787af",
  shellMode: "accent",
  path: "#00afaf",
  gitDirty: "warning",
  gitClean: "success",
  thinking: "thinkingOff",
  thinkingMinimal: "thinkingMinimal",
  thinkingLow: "thinkingLow",
  thinkingMedium: "thinkingMedium",
  context: "dim",
  contextWarn: "warning",
  contextError: "error",
  cost: "text",
  tokens: "muted",
  queue: "accent",
  separator: "dim",
  border: "borderMuted",
};

const RAINBOW_COLORS = [
  "#b281d6",
  "#d787af",
  "#febc38",
  "#e4c00f",
  "#89d281",
  "#00afaf",
  "#178fb9",
  "#b281d6",
];

const CACHE_LIFETIME_MS = 5000;
let cachedConfig: PowerlineThemeConfig | null = null;
let lastCacheUpdate = 0;
let cacheIdentifier = "";

const loggedErrors = new Set<string>();

function resolvePackageDir(startDir: string): string {
  let currentDir = startDir;
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(currentDir, "package.json"))) return currentDir;
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }
  return startDir;
}

function fileIdentity(path: string): string {
  try {
    return `${path}:${statSync(path).mtimeMs}`;
  } catch {
    return `${path}:missing`;
  }
}

function getConfigurationPaths(): string[] {
  const currentFileDir = dirname(fileURLToPath(import.meta.url));
  const pkgDir = resolvePackageDir(currentFileDir);
  return [
    getAgentPath("extensions", "powerline-footer", "theme.json"),
    join(process.cwd(), "theme.json"),
    join(pkgDir, "theme.json"),
  ];
}

function mergeThemeConfig(base: PowerlineThemeConfig, overrides: unknown): PowerlineThemeConfig {
  if (typeof overrides !== "object" || overrides === null || Array.isArray(overrides)) {
    return base;
  }
  
  const record = overrides as Record<string, unknown>;
  return {
    colors: record.colors !== undefined ? record.colors : base.colors,
    icons: record.icons !== undefined ? record.icons : base.icons,
  };
}

export function loadThemeConfig(): PowerlineThemeConfig {
  const paths = getConfigurationPaths();
  const identity = paths.map(fileIdentity).join("|");
  const time = Date.now();

  if (cachedConfig && cacheIdentifier === identity && time - lastCacheUpdate < CACHE_LIFETIME_MS) {
    return cachedConfig;
  }

  let finalConfig: PowerlineThemeConfig = {};

  for (const path of paths) {
    try {
      if (existsSync(path)) {
        const rawContent = readFileSync(path, "utf8");
        const parsedData = JSON.parse(rawContent);
        finalConfig = mergeThemeConfig(finalConfig, parsedData);
        break; // Stop after first successful load
      }
    } catch (e: unknown) {
      if (e instanceof SyntaxError) {
        console.debug(`[theme] SyntaxError in ${path}:`, e.message);
      } else if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist despite existsSync, ignore
      } else {
        console.debug(`[theme] Unexpected error reading ${path}:`, e);
      }
    }
  }

  cachedConfig = finalConfig;
  lastCacheUpdate = time;
  cacheIdentifier = identity;
  
  return finalConfig;
}

function sanitizeUserColors(rawColors: unknown): ColorScheme {
  if (typeof rawColors !== "object" || rawColors === null || Array.isArray(rawColors)) return {};
  
  const result: ColorScheme = {};
  for (const key of Object.keys(DEFAULT_COLORS)) {
    const val = (rawColors as Record<string, unknown>)[key];
    if (typeof val === "string" && val.trim().length > 0) {
      result[key as SemanticColor] = val.trim() as ColorValue;
    }
  }
  return result;
}

export function resolveColor(
  semantic: SemanticColor,
  presetColors?: ColorScheme,
): ColorValue {
  const config = loadThemeConfig();
  const userColors = sanitizeUserColors(config.colors);
  
  if (userColors[semantic] !== undefined) {
    return userColors[semantic] as ColorValue;
  }
  if (presetColors && presetColors[semantic] !== undefined) {
    return presetColors[semantic] as ColorValue;
  }
  return DEFAULT_COLORS[semantic];
}

function hexToRgbAnsi(hex: string): string {
  const cleanHex = hex.replace("#", "");
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

export function applyColor(
  theme: ThemeLike,
  color: ColorValue,
  text: string,
): string {
  if (typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color)) {
    return `${hexToRgbAnsi(color)}${text}\x1b[0m`;
  }

  try {
    return theme.fg(color as ThemeColor, text);
  } catch (e) {
    const errorKey = String(color);
    if (!loggedErrors.has(errorKey)) {
      loggedErrors.add(errorKey);
      if (loggedErrors.size > 100) loggedErrors.clear();
      console.debug(`[theme] Invalid color "${errorKey}". Fallback to text.`, e);
    }
    return theme.fg("text", text);
  }
}

export function fg(
  theme: ThemeLike,
  semantic: SemanticColor,
  text: string,
  presetColors?: ColorScheme,
): string {
  const c = resolveColor(semantic, presetColors);
  return applyColor(theme, c, text);
}

export function rainbow(text: string): string {
  let output = "";
  let i = 0;
  for (const char of text) {
    if (char === " " || char === ":") {
      output += char;
    } else {
      const hex = RAINBOW_COLORS[i % RAINBOW_COLORS.length];
      output += hexToRgbAnsi(hex) + char;
      i++;
    }
  }
  return output + "\x1b[0m";
}

export function getDefaultColors(): Required<ColorScheme> {
  return { ...DEFAULT_COLORS };
}
