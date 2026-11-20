import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openSkillStudio } from "../src/studio/open.ts";
import type { createStudioComponent } from "../src/studio/component.ts";

const theme = {
  fg: (_role: string, text: string) => text,
  bold: (text: string) => text,
};

type StudioComponent = ReturnType<typeof createStudioComponent>;

interface HarnessOptions {
  /** Produce the stream for the Nth provider.stream call. */
  streamFor(call: number, signal: AbortSignal): AsyncIterable<unknown>;
  /** Produce the auth result for the Nth getApiKeyAndHeaders call. */
  authFor?(call: number): Promise<{ ok: boolean; apiKey?: string }>;
}

/**
 * Boots openSkillStudio with a fake ctx: one real fixture skill on disk (so
 * list filtering can select it), a fake model registry whose provider stream
 * is fully scripted, and a ui.custom that captures the live component.
 */
function makeStudioHarness(opts: HarnessOptions) {
  const cwd = mkdtempSync(join(tmpdir(), "studio-advice-"));
  mkdirSync(join(cwd, ".pi", "skills", "0fixture"), { recursive: true });
  writeFileSync(
    join(cwd, ".pi", "skills", "0fixture", "SKILL.md"),
    "---\nname: 0fixture\ndescription: fixture skill for advice lifecycle tests\n---\nfixture body without repo links\n",
  );
  const notices: string[] = [];
  const streamSignals: AbortSignal[] = [];
  let streamCalls = 0;
  let authCalls = 0;
  let component: StudioComponent | undefined;
  let doneValue: string | null | undefined;
  const rt: any = { enabled: true, currentCtx: null, studioAbort: null };
  const ctx: any = {
    hasUI: true,
    mode: "interactive",
    cwd,
    model: { id: "fixture-model", provider: "fixture", contextWindow: 8192, maxTokens: 512 },
    modelRegistry: {
      getProvider: () => ({
        stream: (_model: unknown, _context: unknown, options: { signal: AbortSignal }) => {
          streamCalls += 1;
          streamSignals.push(options.signal);
          return opts.streamFor(streamCalls, options.signal);
        },
      }),
      getApiKeyAndHeaders: () => {
        const call = ++authCalls;
        return opts.authFor ? opts.authFor(call) : Promise.resolve({ ok: true, apiKey: "k" });
      },
    },
    ui: {
      notify: (message: string) => notices.push(message),
      custom: async (factory: any) => {
        component = factory(null, theme, null, (value: string | null) => {
          doneValue = value;
        });
        return undefined;
      },
    },
  };
  const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
  const settle = async () => {
    for (let i = 0; i < 8; i++) await tick();
  };
  return {
    rt,
    notices,
    streamSignals,
    get streamCalls() {
      return streamCalls;
    },
    get component() {
      return component;
    },
    get doneValue() {
      return doneValue;
    },
    async open() {
      await openSkillStudio(rt, ctx);
      assert.ok(component);
    },
    /** Filter to the fixture skill and focus the advice pane. */
    focusAdvice() {
      component!.handleInput("/");
      for (const ch of "0fixture") component!.handleInput(ch);
      component!.handleInput("\r");
      component!.handleInput("4");
    },
    frame: () => component!.render(100).join("\n"),
    settle,
  };
}

test("a second advice run aborts the in-flight one and owns the pane", async () => {
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const h = makeStudioHarness({
    streamFor: (call) =>
      call === 1
        ? (async function* () {
            await firstGate;
            yield { delta: "stale-chunk" };
          })()
        : (async function* () {
            yield { delta: "fresh-run" };
          })(),
  });
  await h.open();
  h.focusAdvice();

  h.component!.handleInput("r");
  await h.settle();
  assert.equal(h.streamCalls, 1);
  const firstSignal = h.streamSignals[0]!;
  assert.equal(firstSignal.aborted, false);

  h.component!.handleInput("r");
  await h.settle();
  assert.equal(h.streamCalls, 2);
  assert.equal(firstSignal.aborted, true);
  assert.equal(h.streamSignals[1]!.aborted, false);
  assert.match(h.frame(), /fresh-run/);

  releaseFirst();
  await h.settle();
  const frame = h.frame();
  assert.match(frame, /fresh-run/);
  assert.doesNotMatch(frame, /stale-chunk/);
});

test("a run superseded while awaiting auth never claims the pane", async () => {
  let releaseAuth!: () => void;
  const authGate = new Promise<void>((resolve) => {
    releaseAuth = resolve;
  });
  const h = makeStudioHarness({
    authFor: async (call) => {
      if (call === 1) await authGate;
      return { ok: true, apiKey: "k" };
    },
    streamFor: () =>
      (async function* () {
        yield { delta: "fresh-run" };
      })(),
  });
  await h.open();
  h.focusAdvice();

  h.component!.handleInput("r"); // run 1 parks at the auth gate
  await h.settle();
  assert.equal(h.streamCalls, 0);
  const firstSignal = h.rt.studioAbort!.signal as AbortSignal;

  h.component!.handleInput("r"); // run 2 aborts run 1 and completes
  await h.settle();
  assert.equal(h.streamCalls, 1);
  assert.equal(firstSignal.aborted, true);
  assert.match(h.frame(), /fresh-run/);

  releaseAuth(); // run 1 resumes — must not reach pane.run
  await h.settle();
  assert.equal(h.streamCalls, 1);
  const frame = h.frame();
  assert.match(frame, /fresh-run/);
  assert.doesNotMatch(frame, /unavailable|aborted/);
});

test("closing the studio aborts the in-flight advice run", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const h = makeStudioHarness({
    streamFor: () =>
      (async function* () {
        await gate;
        yield { delta: "post-close-chunk" };
      })(),
  });
  await h.open();
  h.focusAdvice();

  h.component!.handleInput("r");
  await h.settle();
  assert.equal(h.streamCalls, 1);
  const runSignal = h.rt.studioAbort!.signal as AbortSignal;
  assert.equal(runSignal.aborted, false);

  h.component!.handleInput("q");
  assert.equal(h.doneValue, null);
  // The exact AbortSignal handed to the provider stream is what fires.
  assert.equal(h.streamSignals[0], runSignal);
  assert.equal(runSignal.aborted, true);
  assert.equal(h.rt.studioAbort, null);

  release();
  await h.settle();
  const frame = h.frame();
  assert.match(frame, /Advice unavailable: aborted/);
  assert.doesNotMatch(frame, /post-close-chunk/);
});
