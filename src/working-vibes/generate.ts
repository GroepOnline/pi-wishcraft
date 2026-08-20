// generate.ts
// CLI-arg parsing, batch generation for `/vibe generate`, and sample previews
// for `/vibe test`.

import type {
  AssistantMessage,
  Model,
  ProviderHeaders,
} from "@earendil-works/pi-ai";

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

/**
 * Turn a model's free-text response into clean, ellipsized vibe lines. Pure so
 * both batch generation and sample previews share the same cleanup rules.
 */
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

interface ResolvedVibeModel {
  provider: string;
  model: Model<string>;
  auth: {
    apiKey?: string;
    headers?: ProviderHeaders;
    env?: Record<string, string>;
  };
}

/** Resolve the configured vibe model + credentials, or return a user-facing error. */
async function resolveVibeModelAndAuth(): Promise<
  | { ok: true; value: ResolvedVibeModel }
  | { ok: false; error: string }
> {
  const extensionCtx = vibeState.extensionCtx;
  if (!extensionCtx) {
    return { ok: false, error: "Extension not initialized" };
  }

  const slashIndex = vibeState.config.modelSpec.indexOf("/");
  if (slashIndex === -1) {
    return { ok: false, error: "Invalid model spec" };
  }
  const provider = vibeState.config.modelSpec.slice(0, slashIndex);
  const modelId = vibeState.config.modelSpec.slice(slashIndex + 1);

  const model = extensionCtx.modelRegistry.find(provider, modelId);
  if (!model) {
    return {
      ok: false,
      error: `Model not found: ${vibeState.config.modelSpec}`,
    };
  }

  const auth = await extensionCtx.modelRegistry.getApiKeyAndHeaders(model);
  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }

  return {
    ok: true,
    value: {
      provider,
      model,
      auth: {
        apiKey: auth.apiKey,
        headers: auth.headers,
        env: auth.env,
      },
    },
  };
}

function extractVibeText(
  response: AssistantMessage,
): { text: string; error: string | null } {
  const textContent = response.content.find((c) => c.type === "text");
  if (textContent?.text) {
    return { text: textContent.text, error: null };
  }
  if (response.stopReason === "error" && response.errorMessage) {
    return { text: "", error: response.errorMessage };
  }
  return { text: "", error: "Empty response from model" };
}

export async function generateVibesBatch(
  theme: string,
  count: number = 100,
): Promise<GenerateVibesResult> {
  const filePath = getVibeFilePath(theme);
  const safeCount = Number.isFinite(count)
    ? Math.min(Math.max(Math.floor(count), 1), 500)
    : 100;

  const resolved = await resolveVibeModelAndAuth();
  if (!resolved.ok) {
    return { success: false, count: 0, filePath, error: resolved.error };
  }
  const { provider, model, auth } = resolved.value;

  const prompt = BATCH_PROMPT.replace(/\{theme\}/g, theme).replace(
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

    const { text, error } = extractVibeText(response);
    if (error) {
      return { success: false, count: 0, filePath, error };
    }

    const vibes = parseVibeLines(text);
    if (vibes.length === 0) {
      return {
        success: false,
        count: 0,
        filePath,
        error: "No valid vibes generated",
      };
    }

    saveVibesToFile(theme, vibes);

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

  const resolved = await resolveVibeModelAndAuth();
  if (!resolved.ok) {
    return { success: false, theme, error: resolved.error };
  }
  const { provider, model, auth } = resolved.value;

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

    const { text, error } = extractVibeText(response);
    if (error) {
      return { success: false, theme, error };
    }

    const samples = parseVibeLines(text);
    if (samples.length === 0) {
      return { success: false, theme, error: "No valid vibes generated" };
    }
    return { success: true, theme, samples };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, theme, error: message };
  }
}
