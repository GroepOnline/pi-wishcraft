// generate.ts
// CLI-arg parsing and batch generation for `/vibe generate`.

import {
  BATCH_PROMPT,
  SAMPLES_PROMPT,
  getVibeFilePath,
  saveVibesToFile,
  vibeState,
} from "./storage.ts";
import { buildAiContext, completeVibe } from "./provider.ts";

export type GenerateVibesResult =
  | { success: true; count: number; filePath: string }
  | { success: false; count: 0; filePath: string; error: string };

export type GenerateVibeSamplesResult =
  | { success: true; theme: string; samples: string[] }
  | { success: false; theme: string; error: string };

export function parseVibeLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      let vibe = line.replace(/^["'\d.\-)\s]+/, "").trim();
      vibe = vibe.replace(/["']$/g, "");
      if (!vibe.endsWith("...")) {
        vibe = vibe.replace(/\.+$/, "") + "...";
      }
      return vibe;
    })
    .filter((vibe) => vibe.length > 3 && vibe !== "...");
}

export function parseVibeGenerateArgs(
  args: readonly string[],
): { theme: string; count: number } | null {
  if (args.length === 0) return null;

  const last = args.at(-1);
  const parsedCount =
    last && /^\d+$/.test(last) ? Number.parseInt(last, 10) : Number.NaN;
  const hasCount = Number.isFinite(parsedCount) && args.length > 1;
  const theme = hasCount ? args.slice(0, -1).join(" ") : args.join(" ");
  if (!theme) return null;

  return {
    theme,
    count: hasCount ? Math.min(Math.max(Math.floor(parsedCount), 1), 500) : 100,
  };
}

export async function generateVibesBatch(
  theme: string,
  count: number = 100,
): Promise<GenerateVibesResult> {
  const filePath = getVibeFilePath(theme);
  const safeCount = Number.isFinite(count)
    ? Math.min(Math.max(Math.floor(count), 1), 500)
    : 100;

  if (!vibeState.extensionCtx) {
    return {
      success: false,
      count: 0,
      filePath,
      error: "Extension not initialized",
    };
  }

  // Parse model spec
  const slashIndex = vibeState.config.modelSpec.indexOf("/");
  if (slashIndex === -1) {
    return { success: false, count: 0, filePath, error: "Invalid model spec" };
  }
  const provider = vibeState.config.modelSpec.slice(0, slashIndex);
  const modelId = vibeState.config.modelSpec.slice(slashIndex + 1);

  // Resolve model
  const model = vibeState.extensionCtx.modelRegistry.find(provider, modelId);
  if (!model) {
    return {
      success: false,
      count: 0,
      filePath,
      error: `Model not found: ${vibeState.config.modelSpec}`,
    };
  }

  // Get auth
  const auth =
    await vibeState.extensionCtx.modelRegistry.getApiKeyAndHeaders(model);
  if (!auth.ok) {
    return { success: false, count: 0, filePath, error: auth.error };
  }

  // Build batch prompt
  const prompt = BATCH_PROMPT.replace(/\{theme\}/g, theme).replace(
    /\{count\}/g,
    String(safeCount),
  );

  const aiContext = buildAiContext(prompt);

  try {
    // Use longer timeout for batch generation (30 seconds)
    const signal = AbortSignal.timeout(30000);
    const response = await completeVibe(provider, model, aiContext, {
      apiKey: auth.apiKey,
      headers: auth.headers,
      env: auth.env,
      signal,
    });

    const textContent = response.content.find((c) => c.type === "text");
    if (!textContent?.text) {
      const error =
        response.stopReason === "error" && response.errorMessage
          ? response.errorMessage
          : "Empty response from model";
      return { success: false, count: 0, filePath, error };
    }

    // Parse response: one vibe per line
    const vibes = parseVibeLines(textContent.text);

    if (vibes.length === 0) {
      return {
        success: false,
        count: 0,
        filePath,
        error: "No valid vibes generated",
      };
    }

    // Save to file
    saveVibesToFile(theme, vibes);

    // Clear cache so next use loads fresh
    if (vibeState.vibeCacheTheme === theme) {
      vibeState.vibeCache = [];
      vibeState.vibeCacheTheme = null;
    }

    return { success: true, count: vibes.length, filePath };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, count: 0, filePath, error: message };
  }
}

/** Preview a few vibes for `theme` without saving a file or changing the theme. */
export async function generateVibeSamples(
  theme: string,
  count: number = 3,
): Promise<GenerateVibeSamplesResult> {
  const safeCount = Math.min(Math.max(Math.floor(count), 1), 5);

  if (!vibeState.extensionCtx) {
    return { success: false, theme, error: "Extension not initialized" };
  }

  const slashIndex = vibeState.config.modelSpec.indexOf("/");
  if (slashIndex === -1) {
    return { success: false, theme, error: "Invalid model spec" };
  }
  const provider = vibeState.config.modelSpec.slice(0, slashIndex);
  const modelId = vibeState.config.modelSpec.slice(slashIndex + 1);
  const model = vibeState.extensionCtx.modelRegistry.find(provider, modelId);
  if (!model) {
    return {
      success: false,
      theme,
      error: `Model not found: ${vibeState.config.modelSpec}`,
    };
  }

  const auth =
    await vibeState.extensionCtx.modelRegistry.getApiKeyAndHeaders(model);
  if (!auth.ok) {
    return { success: false, theme, error: auth.error };
  }

  const prompt = SAMPLES_PROMPT.replace(/\{theme\}/g, theme).replace(
    /\{count\}/g,
    String(safeCount),
  );

  try {
    const response = await completeVibe(provider, model, buildAiContext(prompt), {
      apiKey: auth.apiKey,
      headers: auth.headers,
      env: auth.env,
      signal: AbortSignal.timeout(30000),
    });

    const textContent = response.content.find((c) => c.type === "text");
    if (!textContent?.text) {
      const error =
        response.stopReason === "error" && response.errorMessage
          ? response.errorMessage
          : "Empty response from model";
      return { success: false, theme, error };
    }

    const samples = parseVibeLines(textContent.text);
    if (samples.length === 0) {
      return { success: false, theme, error: "No valid vibes generated" };
    }
    return { success: true, theme, samples };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, theme, error: message };
  }
}
