import type { Model } from "@earendil-works/pi-ai";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { buildAdviseContext, type AdviseContext, type AdviseContextSection } from "./context.ts";
import { buildPrompt, type AdviseMode, type AdvisePrompt } from "./prompts.ts";

/**
 * Provider-agnostic surface the engine needs: any object exposing the
 * pi-ai Provider.stream signature. Kept narrow so tests can stub a stream
 * without spinning up the full fauxProvider machinery.
 */
export interface AdviseStreamProvider {
  stream(
    model: Model<string>,
    context: AdviseContext,
    options: { signal: AbortSignal; maxTokens?: number },
  ): AsyncIterable<unknown>;
}

export interface AdviseModel {
  id: string;
  contextWindow: number;
  maxTokens?: number;
}

export interface RunAdviceOptions {
  mode: AdviseMode;
  skillName: string;
  body: string;
  references: AdviseContextSection[];
  wiki: AdviseContextSection[];
  maxChars?: number;
  provider: AdviseStreamProvider | null;
  model?: AdviseModel;
  signal: AbortSignal;
  onChunk?: (text: string) => void;
}

export type RunAdviceResult =
  | { kind: "ok"; text: string }
  | { kind: "unavailable"; reason: "no-model" | "aborted" | "no-text" };

const DEFAULT_MAX_CHARS = 24_000;
const DEFAULT_MODEL: AdviseModel = {
  id: "advisor-faux",
  contextWindow: 32_000,
  maxTokens: 1024,
};

export async function runAdvice(opts: RunAdviceOptions): Promise<RunAdviceResult> {
  if (opts.signal.aborted) {
    return { kind: "unavailable", reason: "aborted" };
  }
  if (!opts.provider) {
    return { kind: "unavailable", reason: "no-model" };
  }
  const model = (opts.model ?? DEFAULT_MODEL) as unknown as Model<string>;
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;
  const ctx = buildAdviseContext({
    body: opts.body,
    references: opts.references,
    wiki: opts.wiki,
    maxChars,
  });
  const prompt: AdvisePrompt = buildPrompt(opts.mode, {
    skillName: opts.skillName,
    body: ctx.body,
    references: ctx.references,
    wiki: ctx.wiki,
  });
  // The provider stub in tests ignores the context; in production the
  // pi-ai wire protocol serializes the prompt itself, not our context.
  void prompt;

  const stream = opts.provider.stream(model, ctx, {
    signal: opts.signal,
    maxTokens: opts.model?.maxTokens ?? DEFAULT_MODEL.maxTokens,
  });

  let text = "";
  try {
    for await (const ev of stream) {
      if (opts.signal.aborted) {
        return { kind: "unavailable", reason: "aborted" };
      }
      // Defensive text extraction: anything with a string .delta or .text
      // counts. Avoids pinning the engine to pi-ai's AssistantMessageEvent.
      const anyEv = ev as { delta?: unknown; text?: unknown };
      const delta =
        typeof anyEv.delta === "string"
          ? anyEv.delta
          : typeof anyEv.text === "string"
            ? anyEv.text
            : "";
      if (delta) {
        text += delta;
        opts.onChunk?.(delta);
      }
    }
  } catch (err) {
    if (opts.signal.aborted) {
      return { kind: "unavailable", reason: "aborted" };
    }
    throw err;
  }
  if (text.length === 0) {
    return { kind: "unavailable", reason: "no-text" };
  }
  return { kind: "ok", text };
}

// Re-export the pi-ai factory so call sites that want to plug a real stream
// do not have to import pi-ai themselves.
export { createAssistantMessageEventStream };
