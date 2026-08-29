import { loadThemeConfig } from "./theme.ts";

export interface IconSet {
  pi: string;
  model: string;
  folder: string;
  branch: string;
  git: string;
  github: string;
  gitlab: string;
  bitbucket: string;
  tokens: string;
  context: string;
  cost: string;
  time: string;
  agents: string;
  cache: string;
  input: string;
  output: string;
  host: string;
  session: string;
  auto: string;
  warning: string;
  tps: string;
  ports: string;
}

export const SEP_DOT: string = " · ";

export const THINKING_TEXT_UNICODE: Record<string, string> = {
  minimal: "[min]",
  low: "[low]",
  medium: "[med]",
  high: "[high]",
  xhigh: "[xhi]",
};

export const THINKING_TEXT_NERD: Record<string, string> = {
  minimal: "\u{F0E7} min",
  low: "\u{F10C} low",
  medium: "\u{F192} med",
  high: "\u{F111} high",
  xhigh: "\u{F06D} xhi",
};

export function getThinkingText(level: string): string | undefined {
  const map = hasNerdFonts() ? THINKING_TEXT_NERD : THINKING_TEXT_UNICODE;
  return map[level];
}

export const NERD_ICONS: IconSet = {
  pi: "\uE22C",
  model: "\uEC19",
  folder: "\uF115",
  branch: "\uF126",
  git: "\uF1D3",
  github: "\uF09B",
  gitlab: "\uF296",
  bitbucket: "\uF171",
  tokens: "\uE26B",
  context: "\uF1C0",
  cost: "\uF155",
  time: "\uF017",
  agents: "\uF0C0",
  cache: "\uF1C0",
  input: "\uF090",
  output: "\uF08B",
  host: "\uF109",
  session: "\uF550",
  auto: "\u{F0068}",
  warning: "\uF071",
  tps: "\uF135",
  ports: "\uF1E6",
};

export const ASCII_ICONS: IconSet = {
  pi: "π",
  model: "",
  folder: "dir",
  branch: "⎇",
  git: "⎇",
  github: "⎇",
  gitlab: "⎇",
  bitbucket: "⎇",
  tokens: "⊛",
  context: "◫",
  cost: "$",
  time: "◷",
  agents: "AG",
  cache: "cache",
  input: "in:",
  output: "out:",
  host: "host",
  session: "id",
  auto: "AC",
  warning: "!",
  tps: "⚡",
  ports: "▣",
};

function sanitizeUserIconOverrides(value: unknown): Partial<IconSet> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const result: Partial<IconSet> = {};
  const validKeys = new Set<string>(Object.keys(NERD_ICONS));
  for (const [key, val] of Object.entries(value)) {
    if (validKeys.has(key) && typeof val === "string") {
      result[key as keyof IconSet] = val;
    }
  }
  return result;
}

export interface SeparatorChars {
  powerlineLeft: string;
  powerlineRight: string;
  powerlineThinLeft: string;
  powerlineThinRight: string;
  slash: string;
  pipe: string;
  block: string;
  space: string;
  asciiLeft: string;
  asciiRight: string;
  dot: string;
  bluntLeft: string;
  bluntRight: string;
  roundedLeft: string;
  roundedRight: string;
  diamond: string;
  doubleLeft: string;
  doubleRight: string;
}

export const NERD_SEPARATORS: SeparatorChars = {
  powerlineLeft: "\uE0B0",
  powerlineRight: "\uE0B2",
  powerlineThinLeft: "\uE0B1",
  powerlineThinRight: "\uE0B3",
  slash: "/",
  pipe: "|",
  block: "█",
  space: " ",
  asciiLeft: ">",
  asciiRight: "<",
  dot: "·",
  bluntLeft: "▌",
  bluntRight: "▐",
  roundedLeft: "\uE0B6",
  roundedRight: "\uE0B4",
  diamond: "◇",
  doubleLeft: "»",
  doubleRight: "«",
};

export const ASCII_SEPARATORS: SeparatorChars = {
  powerlineLeft: ">",
  powerlineRight: "<",
  powerlineThinLeft: "|",
  powerlineThinRight: "|",
  slash: "/",
  pipe: "|",
  block: "#",
  space: " ",
  asciiLeft: ">",
  asciiRight: "<",
  dot: ".",
  bluntLeft: "[",
  bluntRight: "]",
  roundedLeft: "(",
  roundedRight: ")",
  diamond: "*",
  doubleLeft: ">",
  doubleRight: "<",
};

export function hasNerdFonts(): boolean {
  if (process.env.POWERLINE_NERD_FONTS === "1") return true;
  if (process.env.POWERLINE_NERD_FONTS === "0") return false;
  if (process.env.GHOSTTY_RESOURCES_DIR) return true;
  
  const currentTerm = (process.env.TERM_PROGRAM || "").toLowerCase();
  const supported = ["iterm", "wezterm", "kitty", "ghostty", "alacritty"];
  return supported.some((t) => currentTerm.includes(t));
}

export function getIcons(): IconSet {
  const defaults = hasNerdFonts() ? NERD_ICONS : ASCII_ICONS;
  const config = loadThemeConfig();
  return { ...defaults, ...sanitizeUserIconOverrides(config.icons) };
}

export function getSeparatorChars(): SeparatorChars {
  return hasNerdFonts() ? NERD_SEPARATORS : ASCII_SEPARATORS;
}
