// storage.ts
// AI-generated contextual working messages that match a user's preferred theme/vibe.
// Holds settings/config persistence, on-disk vibe file storage, and the shared
// module-level state (matching powerline-footer pattern).

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { getAgentPath } from "../paths/agent-dirs.ts";

export type VibeMode = "generate" | "file";
export type WorkingIndicatorStyle = "dots" | "pulse" | "bar" | "ascii";

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

export const DEFAULT_MODEL = "openai-codex/gpt-5.4-mini";

export const DEFAULT_PROMPT = `Generate a 2-4 word "{theme}" themed loading message ending in "...".

Task: {task}

Be creative and unexpected. Avoid obvious/clichéd phrases for this theme.
The message should hint at the task using theme vocabulary.
{exclude}
Output only the message, nothing else.`;

export const BATCH_PROMPT = `Generate {count} unique 2-4 word loading messages for a "{theme}" theme.
Each message should end with "..."
Be creative, varied, and thematic. No duplicates.
Output one message per line, nothing else. No numbering, no bullets.`;

export const SAMPLES_PROMPT = `Generate {count} distinct 2-4 word loading messages for a "{theme}" theme.
Each message should end with "..." and hint at a different activity.
Be creative, varied, and thematic. No duplicates.
Output one message per line, nothing else. No numbering, no bullets.`;

export const VIBE_SYSTEM_PROMPT =
  "You generate short themed loading messages and reply with the requested text only.";

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface VibeConfig {
  theme: string | null; // null = disabled
  mode: VibeMode; // "generate" (on-demand) or "file" (pre-generated)
  modelSpec: string; // default: "openai-codex/gpt-5.4-mini"
  fallback: string; // default: "Working"
  timeout: number; // default: 3000ms
  refreshInterval: number; // default: 30000ms (30s)
  promptTemplate: string; // template with {theme}, {task}, {exclude} placeholders
  maxLength: number; // default: 65 chars
  workingIndicatorStyle: WorkingIndicatorStyle;
}

// ═══════════════════════════════════════════════════════════════════════════
// Module-level State
// ═══════════════════════════════════════════════════════════════════════════

// Recent vibes tracking (to avoid repetition in generate mode)
export const MAX_RECENT_VIBES = 5;

// Shared mutable state, kept as a single object so other modules can read and
// mutate it (via property assignment) while still importing a stable binding.
export const vibeState = {
  config: loadConfig(),
  extensionCtx: null as ExtensionContext | null,
  currentGeneration: null as AbortController | null,
  isStreaming: false,
  lastVibeTime: 0,

  // File-based mode state
  vibeCache: [] as string[], // Cached vibes from file
  vibeCacheTheme: null as string | null, // Theme the cache is for
  vibeSeed: Date.now(), // Seed for deterministic shuffle
  vibeIndex: 0, // Current position in shuffled list

  recentVibes: [] as string[],
};

// ═══════════════════════════════════════════════════════════════════════════
// Configuration Management
// ═══════════════════════════════════════════════════════════════════════════

function getSettingsPath(): string {
  return getAgentPath("settings.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSettingsForLoad(): Record<string, unknown> {
  const settingsPath = getSettingsPath();

  try {
    if (!existsSync(settingsPath)) {
      return {};
    }

    const parsed = JSON.parse(readFileSync(settingsPath, "utf-8"));
    if (!isRecord(parsed)) {
      console.debug(
        `[working-vibes] Ignoring non-object settings at ${settingsPath}`,
      );
      return {};
    }

    return parsed;
  } catch (error) {
    console.debug(
      `[working-vibes] Failed to load settings from ${settingsPath}:`,
      error,
    );
    return {};
  }
}

function readSettingsForWrite(scope: string): Record<string, unknown> | null {
  const settingsPath = getSettingsPath();

  if (!existsSync(settingsPath)) {
    return {};
  }

  try {
    const parsed = JSON.parse(readFileSync(settingsPath, "utf-8"));
    if (!isRecord(parsed)) {
      console.debug(
        `[working-vibes] Refusing to write ${scope}: settings at ${settingsPath} is not an object`,
      );
      return null;
    }

    return parsed;
  } catch (error) {
    console.debug(
      `[working-vibes] Failed to parse settings while writing ${scope} at ${settingsPath}:`,
      error,
    );
    return null;
  }
}

function persistSettings(
  settings: Record<string, unknown>,
  scope: string,
): boolean {
  const settingsPath = getSettingsPath();

  try {
    mkdirSync(dirname(settingsPath), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
    return true;
  } catch (error) {
    console.debug(
      `[working-vibes] Failed to persist ${scope} to ${settingsPath}:`,
      error,
    );
    return false;
  }
}

export function loadConfig(): VibeConfig {
  const settings = readSettingsForLoad();

  // Handle "off" in settings.json (same as null/disabled)
  const rawTheme =
    typeof settings.workingVibe === "string" ? settings.workingVibe : null;
  const theme = rawTheme?.toLowerCase() === "off" ? null : rawTheme;

  // Validate mode setting
  const rawMode = settings.workingVibeMode;
  const mode: VibeMode =
    rawMode === "file" || rawMode === "generate" ? rawMode : "generate";

  const refreshSeconds =
    typeof settings.workingVibeRefreshInterval === "number" &&
    Number.isFinite(settings.workingVibeRefreshInterval)
      ? Math.max(0, settings.workingVibeRefreshInterval)
      : 30;

  const rawIndicator = settings.wishcraft && isRecord(settings.wishcraft)
    ? settings.wishcraft.workingIndicatorStyle
    : settings.workingIndicatorStyle;
  const workingIndicatorStyle: WorkingIndicatorStyle =
    rawIndicator === "pulse" || rawIndicator === "bar" || rawIndicator === "ascii"
      ? rawIndicator
      : "dots";

  const maxLength =
    typeof settings.workingVibeMaxLength === "number" &&
    Number.isFinite(settings.workingVibeMaxLength)
      ? Math.max(4, Math.floor(settings.workingVibeMaxLength))
      : 65;

  return {
    theme,
    mode,
    modelSpec:
      typeof settings.workingVibeModel === "string"
        ? settings.workingVibeModel
        : DEFAULT_MODEL,
    fallback:
      typeof settings.workingVibeFallback === "string"
        ? settings.workingVibeFallback
        : "Working",
    timeout: 3000,
    refreshInterval: refreshSeconds * 1000,
    promptTemplate:
      typeof settings.workingVibePrompt === "string"
        ? settings.workingVibePrompt
        : DEFAULT_PROMPT,
    maxLength,
    workingIndicatorStyle,
  };
}

export function saveConfig(): boolean {
  const settings = readSettingsForWrite("workingVibe");
  if (!settings) {
    return false;
  }

  if (vibeState.config.theme === null) {
    delete settings.workingVibe;
  } else {
    settings.workingVibe = vibeState.config.theme;
  }

  return persistSettings(settings, "workingVibe");
}

export function saveModelConfig(): boolean {
  const settings = readSettingsForWrite("workingVibeModel");
  if (!settings) {
    return false;
  }

  if (vibeState.config.modelSpec === DEFAULT_MODEL) {
    delete settings.workingVibeModel;
  } else {
    settings.workingVibeModel = vibeState.config.modelSpec;
  }

  return persistSettings(settings, "workingVibeModel");
}

export function saveModeConfig(): boolean {
  const settings = readSettingsForWrite("workingVibeMode");
  if (!settings) {
    return false;
  }

  if (vibeState.config.mode === "generate") {
    delete settings.workingVibeMode;
  } else {
    settings.workingVibeMode = vibeState.config.mode;
  }

  return persistSettings(settings, "workingVibeMode");
}

// ═══════════════════════════════════════════════════════════════════════════
// File-Based Vibe Management
// ═══════════════════════════════════════════════════════════════════════════

function getVibesDir(): string {
  return getAgentPath("vibes");
}

function toVibeFileSlug(theme: string): string {
  const slug = theme
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");

  return slug || "theme";
}

export function getVibeFilePath(theme: string): string {
  const filename = `${toVibeFileSlug(theme)}.txt`;
  return join(getVibesDir(), filename);
}

export function loadVibesFromFile(theme: string): string[] {
  const filePath = getVibeFilePath(theme);
  if (!existsSync(filePath)) return [];

  try {
    const content = readFileSync(filePath, "utf-8");
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && line.endsWith("..."));
  } catch (error) {
    console.debug(
      `[working-vibes] Failed to load vibe file ${filePath}:`,
      error,
    );
    return [];
  }
}

export function saveVibesToFile(theme: string, vibes: string[]): void {
  const vibesDir = getVibesDir();
  const filePath = getVibeFilePath(theme);

  // Ensure directory exists
  if (!existsSync(vibesDir)) {
    mkdirSync(vibesDir, { recursive: true });
  }

  writeFileSync(filePath, vibes.join("\n"));
}

// Mulberry32 PRNG - fast, deterministic, good distribution
function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Get vibe at index using seeded shuffle (no-repeat until all used)
function getVibeAtIndex(vibes: string[], index: number, seed: number): string {
  if (vibes.length === 0) return `${vibeState.config.fallback}...`;

  // For small lists or when we've cycled through, just use modulo
  const effectiveIndex = index % vibes.length;

  // Create deterministic shuffle using seed
  const rng = mulberry32(seed);
  const indices = Array.from({ length: vibes.length }, (_, i) => i);

  // Fisher-Yates shuffle with seeded RNG
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  return vibes[indices[effectiveIndex]];
}

export function getNextVibeFromFile(): string {
  if (!vibeState.config.theme) return `${vibeState.config.fallback}...`;

  // Load/reload cache if theme changed
  if (vibeState.vibeCacheTheme !== vibeState.config.theme) {
    vibeState.vibeCache = loadVibesFromFile(vibeState.config.theme);
    vibeState.vibeCacheTheme = vibeState.config.theme;
    vibeState.vibeSeed = Date.now(); // New seed for new theme
    vibeState.vibeIndex = 0;
  }

  if (vibeState.vibeCache.length === 0) {
    return `${vibeState.config.fallback}...`;
  }

  const vibe = getVibeAtIndex(
    vibeState.vibeCache,
    vibeState.vibeIndex,
    vibeState.vibeSeed,
  );
  vibeState.vibeIndex++;
  return vibe;
}
