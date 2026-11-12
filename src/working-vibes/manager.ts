// manager.ts
// Public lifecycle API for the working-vibes manager (called from index.ts).

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { existsSync } from "node:fs";
import {
  MAX_RECENT_VIBES,
  getNextVibeFromFile,
  getVibeFilePath,
  loadConfig,
  loadVibesFromFile,
  saveConfig,
  saveModeConfig,
  saveModelConfig,
  vibeState,
  type VibeMode,
} from "./storage.ts";
import { generateVibe } from "./provider.ts";
import { applyColor } from "../theme/theme.ts";
import type { ColorValue, ThemeLike } from "../config/types.ts";
import { debugLog } from "../extension/core/debug-log.ts";

function trackRecentVibe(vibe: string): void {
  // Don't track fallback messages
  if (vibe === `${vibeState.config.fallback}...`) return;

  // Add to front, remove duplicates
  vibeState.recentVibes = [
    vibe,
    ...vibeState.recentVibes.filter((v) => v !== vibe),
  ].slice(0, MAX_RECENT_VIBES);
}

/**
 * The session theme, resolved lazily from the stored extension context so the
 * color always follows a live theme switch. `ctx.ui` can throw once the
 * context goes stale — an unstyled message beats a dropped one.
 */
function vibeMessageTheme(): ThemeLike | null {
  try {
    return vibeState.extensionCtx?.ui?.theme ?? null;
  } catch {
    return null;
  }
}

function setStyledWorkingMessage(
  setWorkingMessage: (msg?: string) => void,
  message?: string,
): void {
  const color = vibeState.workingMessageColor;
  const theme = message && color ? vibeMessageTheme() : null;
  if (!message || !color || !theme) {
    setWorkingMessage(message);
    return;
  }
  setWorkingMessage(applyColor(theme, color, message));
}

function updateVibeFromFile(setWorkingMessage: (msg?: string) => void): void {
  setStyledWorkingMessage(setWorkingMessage, getNextVibeFromFile());
}

async function generateAndUpdate(
  prompt: string,
  setWorkingMessage: (msg?: string) => void,
): Promise<void> {
  // File mode: instant, no API call
  if (vibeState.config.mode === "file") {
    updateVibeFromFile(setWorkingMessage);
    return;
  }

  // Generate mode: API call with abort handling
  // Cancel any in-flight generation and create new controller
  // Capture in local variable to avoid race condition with subsequent calls
  const controller = new AbortController();
  vibeState.currentGeneration?.abort();
  vibeState.currentGeneration = controller;

  // Create timeout signal (3 seconds)
  const timeoutSignal = AbortSignal.timeout(vibeState.config.timeout);
  const combinedSignal = AbortSignal.any([controller.signal, timeoutSignal]);

  try {
    const vibe = await generateVibe(
      { theme: vibeState.config.theme!, userPrompt: prompt },
      combinedSignal,
    );

    // Only update if still streaming and THIS generation wasn't aborted
    if (vibeState.isStreaming && !controller.signal.aborted) {
      trackRecentVibe(vibe);
      setStyledWorkingMessage(setWorkingMessage, vibe);
    }
  } catch (error) {
    // AbortError is expected on timeout/cancel - don't log as error
    if (error instanceof Error && error.name === "AbortError") {
      debugLog("[working-vibes] Generation aborted");
    } else {
      debugLog("[working-vibes] Generation failed:", error);
    }
    // Fallback already showing, no action needed
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Exported Functions (called from index.ts)
// ═══════════════════════════════════════════════════════════════════════════

export function initVibeManager(ctx: ExtensionContext): void {
  vibeState.extensionCtx = ctx;
  vibeState.config = loadConfig(); // Refresh config in case settings changed
}

export function getVibeTheme(): string | null {
  return vibeState.config.theme;
}

export function setVibeTheme(theme: string | null): boolean {
  vibeState.config = { ...vibeState.config, theme };
  vibeState.recentVibes = []; // Clear recent vibes on theme change
  return saveConfig();
}

/**
 * Set the color applied to working-vibe messages (powerline.workingVibes.color).
 * Accepts a Pi theme color, `#RRGGBB` hex, or "rainbow"; undefined restores
 * Pi's default message styling.
 */
export function setVibeWorkingMessageColor(
  color: ColorValue | undefined,
): void {
  vibeState.workingMessageColor = color;
}

export function getVibeModel(): string {
  return vibeState.config.modelSpec;
}

export function setVibeModel(modelSpec: string): boolean {
  vibeState.config = { ...vibeState.config, modelSpec };
  return saveModelConfig();
}

export function onVibeBeforeAgentStart(
  prompt: string,
  setWorkingMessage: (msg?: string) => void,
): void {
  // Skip if no theme configured or no extensionCtx
  if (!vibeState.config.theme || !vibeState.extensionCtx) return;

  // Queue themed placeholder BEFORE agent_start creates the loader
  // This sets pendingWorkingMessage which is applied when loader is created
  setStyledWorkingMessage(
    setWorkingMessage,
    `Channeling ${vibeState.config.theme}...`,
  );

  // Mark vibe generation time for rate limiting
  vibeState.lastVibeTime = Date.now();

  // Async: generate and update (fire-and-forget, don't await)
  generateAndUpdate(prompt, setWorkingMessage);
}

export function onVibeAgentStart(): void {
  vibeState.isStreaming = true;
}

export function onVibeToolCall(
  toolName: string,
  toolInput: Record<string, unknown>,
  setWorkingMessage: (msg?: string) => void,
  agentContext?: string, // Optional: recent agent response text for richer context
): void {
  // Skip if no theme, not streaming, or no extensionCtx
  if (
    !vibeState.config.theme ||
    !vibeState.extensionCtx ||
    !vibeState.isStreaming
  )
    return;

  // Rate limit: skip if not enough time has passed
  const now = Date.now();
  if (now - vibeState.lastVibeTime < vibeState.config.refreshInterval) return;

  // Prefer agent context if provided (richer, more contextual)
  // Fall back to tool-based hint
  let hint: string;
  if (agentContext && agentContext.length > 10) {
    // Use first ~150 chars of agent context
    hint = agentContext.slice(0, 150);
  } else {
    // Build hint from tool name and input
    hint = `using ${toolName} tool`;
    if (toolName === "read" && toolInput.path) {
      hint = `reading file: ${toolInput.path}`;
    } else if (toolName === "write" && toolInput.path) {
      hint = `writing file: ${toolInput.path}`;
    } else if (toolName === "edit" && toolInput.path) {
      hint = `editing file: ${toolInput.path}`;
    } else if (toolName === "bash" && toolInput.command) {
      const cmd = String(toolInput.command).slice(0, 40);
      hint = `running command: ${cmd}`;
    }
  }

  // Update time and generate new vibe
  vibeState.lastVibeTime = now;
  generateAndUpdate(hint, setWorkingMessage);
}

export function onVibeAgentEnd(
  setWorkingMessage: (msg?: string) => void,
): void {
  vibeState.isStreaming = false;
  // Cancel any in-flight generation
  vibeState.currentGeneration?.abort();
  // Reset to pi's default working message
  setWorkingMessage(undefined);
}

/**
 * Session is going away — drop live handles, cancel in-flight work.
 * Config, cache and recent-vibe history deliberately survive; only the
 * generation controller, streaming flag and extension ctx are cleared.
 */
export function shutdownVibeManager(): void {
  vibeState.isStreaming = false;
  vibeState.currentGeneration?.abort();
  vibeState.currentGeneration = null;
  vibeState.extensionCtx = null;
}

export function getVibeMode(): VibeMode {
  return vibeState.config.mode;
}

export function setVibeMode(mode: VibeMode): boolean {
  vibeState.config = { ...vibeState.config, mode };
  return saveModeConfig();
}

export function hasVibeFile(theme: string): boolean {
  return existsSync(getVibeFilePath(theme));
}

export function getVibeFileCount(theme: string): number {
  const vibes = loadVibesFromFile(theme);
  return vibes.length;
}
