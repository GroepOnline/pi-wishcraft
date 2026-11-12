import { runAdvice, type RunAdviceOptions, type RunAdviceResult, type AdviseStreamProvider } from "./advise/engine.ts";

export type AdvicePaneState = "idle" | "running" | "ok" | "unavailable";

export interface AdvicePane {
  state: AdvicePaneState;
  text: string;
  error: string | null;
  run(opts: Omit<RunAdviceOptions, "onChunk" | "provider"> & {
    provider: AdviseStreamProvider | null;
    callbacks?: AdvicePaneCallbacks;
  }): Promise<void>;
  reset(): void;
}

export interface AdvicePaneCallbacks {
  onChunk?: (text: string) => void;
}

export function createAdvicePane(): AdvicePane {
  let runSeq = 0;
  const pane: AdvicePane = {
    state: "idle",
    text: "",
    error: null,
    async run(opts) {
      const seq = ++runSeq;
      pane.state = "running";
      pane.text = "";
      pane.error = null;
      let result: RunAdviceResult;
      try {
        result = await runAdvice({
          mode: opts.mode,
          skillName: opts.skillName,
          body: opts.body,
          references: opts.references,
          wiki: opts.wiki,
          maxChars: opts.maxChars,
          provider: opts.provider,
          model: opts.model,
          signal: opts.signal,
          onChunk: (delta) => {
            if (seq !== runSeq) return;
            pane.text += delta;
            opts.callbacks?.onChunk?.(delta);
          },
        });
      } catch (err) {
        // Same guard on the error path: a superseded run's failure must
        // not surface over (or rewrite) the newer run's state. The live
        // run still reports the failure and rethrows so callers keep
        // their existing error surface.
        if (seq !== runSeq) return;
        pane.state = "unavailable";
        pane.error = err instanceof Error ? err.message : String(err);
        throw err;
      }
      // A newer run started while this one was in flight — its verdict
      // (or text chunks) must not overwrite the fresh state.
      if (seq !== runSeq) return;
      if (result.kind === "ok") {
        pane.state = "ok";
        pane.error = null;
      } else {
        pane.state = "unavailable";
        pane.error = result.reason;
      }
    },
    reset() {
      runSeq++;
      pane.state = "idle";
      pane.text = "";
      pane.error = null;
    },
  };
  return pane;
}

// ponytail: typed `unknown` session — Studio wires the real session at call
// time. Kept narrow to `appendUserMessage(string)` so we do not depend on
// the full AgentSession shape (TUI imports, model registry, etc.).
export interface AdviceSessionSink {
  appendUserMessage(text: string): unknown;
}

export function advicePaneInsert(pane: AdvicePane, session: AdviceSessionSink): boolean {
  if (pane.state !== "ok") return false;
  if (pane.text.length === 0) return false;
  session.appendUserMessage(pane.text);
  return true;
}
