// provider.ts
// AI generation: streams from the model provider and turns the response into
// a themed working message.

import type {
  AssistantMessage,
  Context,
  Model,
  ProviderStreamOptions,
} from "@earendil-works/pi-ai";
import { VIBE_SYSTEM_PROMPT, vibeState } from "./storage.ts";

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface VibeGenContext {
  theme: string;
  userPrompt: string; // from event.prompt in before_agent_start
}

// Extension-registered providers live in the model registry only: their custom `api` values
// are absent from pi-ai's global api table, so streaming has to go through the provider.
// Credential-derived base URLs are resolved per request, mirroring ModelRuntime.prepareRequest;
// getApiKeyAndHeaders() covers the rest of the request auth but never reports a base URL.
export async function completeVibe(
  providerId: string,
  model: Model<string>,
  context: Context,
  options: ProviderStreamOptions,
): Promise<AssistantMessage> {
  const registry = vibeState.extensionCtx?.modelRegistry;
  const provider = registry?.getProvider(providerId);
  if (!registry || !provider) {
    throw new Error(`Provider not registered: ${providerId}`);
  }

  const baseUrl = (await registry.getProviderAuth(providerId))?.auth.baseUrl;
  const requestModel = baseUrl ? { ...model, baseUrl } : model;
  return provider.stream(requestModel, context, options).result();
}

// ═══════════════════════════════════════════════════════════════════════════
// Prompt Building & Response Parsing (Pure Functions)
// ═══════════════════════════════════════════════════════════════════════════

export function buildVibePrompt(ctx: VibeGenContext): string {
  // Truncate user prompt to save tokens (most context in first 100 chars)
  const task = ctx.userPrompt.slice(0, 100);

  // Build exclusion list from recent vibes
  const exclude =
    vibeState.recentVibes.length > 0
      ? `Don't use: ${vibeState.recentVibes.join(", ")}`
      : "";

  // Use configured template with variable substitution
  return vibeState.config.promptTemplate
    .replace(/\{theme\}/g, ctx.theme)
    .replace(/\{task\}/g, task)
    .replace(/\{exclude\}/g, exclude);
}

export function parseVibeResponse(response: string, fallback: string): string {
  if (!response) return `${fallback}...`;

  // Take only the first line (AI sometimes adds explanations)
  let vibe = response.trim().split("\n")[0].trim();

  // Remove quotes if model wrapped the response
  vibe = vibe.replace(/^["']|["']$/g, "");

  // Ensure ellipsis
  if (!vibe.endsWith("...")) {
    vibe = vibe.replace(/\.+$/, "") + "...";
  }

  // Enforce length limit (configurable, default 65 chars)
  if (vibe.length > vibeState.config.maxLength) {
    vibe = vibe.slice(0, vibeState.config.maxLength - 3) + "...";
  }

  // Final validation
  if (!vibe || vibe === "...") {
    return `${fallback}...`;
  }

  return vibe;
}

export function buildAiContext(prompt: string): Context {
  return {
    systemPrompt: VIBE_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: prompt }],
        timestamp: Date.now(),
      },
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// AI Generation
// ═══════════════════════════════════════════════════════════════════════════

export async function generateVibe(
  ctx: VibeGenContext,
  signal: AbortSignal,
): Promise<string> {
  if (!vibeState.extensionCtx) {
    return `${vibeState.config.fallback}...`;
  }

  // Parse model spec (provider/modelId format, where modelId may contain slashes)
  const slashIndex = vibeState.config.modelSpec.indexOf("/");
  if (slashIndex === -1) {
    return `${vibeState.config.fallback}...`;
  }
  const provider = vibeState.config.modelSpec.slice(0, slashIndex);
  const modelId = vibeState.config.modelSpec.slice(slashIndex + 1);
  if (!provider || !modelId) {
    return `${vibeState.config.fallback}...`;
  }

  // Resolve model from registry
  const model = vibeState.extensionCtx.modelRegistry.find(provider, modelId);
  if (!model) {
    console.debug(
      `[working-vibes] Model not found: ${vibeState.config.modelSpec}`,
    );
    return `${vibeState.config.fallback}...`;
  }

  // Get auth
  const auth =
    await vibeState.extensionCtx.modelRegistry.getApiKeyAndHeaders(model);
  if (!auth.ok) {
    console.debug(`[working-vibes] Auth failed for ${provider}: ${auth.error}`);
    return `${vibeState.config.fallback}...`;
  }

  const aiContext = buildAiContext(buildVibePrompt(ctx));
  const response = await completeVibe(provider, model, aiContext, {
    apiKey: auth.apiKey,
    headers: auth.headers,
    env: auth.env,
    signal,
  });

  const textContent = response.content.find((c) => c.type === "text");
  if (
    !textContent?.text &&
    response.stopReason === "error" &&
    response.errorMessage
  ) {
    console.debug(
      `[working-vibes] Vibe generation failed for ${vibeState.config.modelSpec}: ${response.errorMessage}`,
    );
  }
  return parseVibeResponse(textContent?.text || "", vibeState.config.fallback);
}
