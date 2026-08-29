import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdvicePane,
  advicePaneInsert,
  type AdvicePaneCallbacks,
} from "../src/studio/advice-pane.ts";
import type { AdviseStreamProvider } from "../src/studio/advise/engine.ts";

function chunkedStream(chunks: string[]): AdviseStreamProvider {
  return {
    stream: async function* () {
      for (const c of chunks) yield { delta: c };
    },
  };
}

function fixedStream(text: string): AdviseStreamProvider {
  return chunkedStream([text]);
}

const baseOpts = {
  mode: "explain" as const,
  skillName: "alpha",
  body: "alpha-body",
  references: [],
  wiki: [],
};

test("advice-pane: create returns an empty pane in idle state", () => {
  const pane = createAdvicePane();
  assert.equal(pane.state, "idle");
  assert.equal(pane.text, "");
  assert.equal(pane.error, null);
});

test("advice-pane: run streams chunks into the text buffer", async () => {
  const pane = createAdvicePane();
  const ac = new AbortController();
  await pane.run({ ...baseOpts, provider: chunkedStream(["a", "b", "c"]), signal: ac.signal });
  assert.equal(pane.text, "abc");
  assert.equal(pane.state, "ok");
});

test("advice-pane: missing provider moves to 'unavailable' without throwing", async () => {
  const pane = createAdvicePane();
  await pane.run({ ...baseOpts, provider: null, signal: new AbortController().signal });
  assert.equal(pane.state, "unavailable");
  assert.equal(pane.error, "no-model");
});

test("advice-pane: empty stream moves to 'unavailable' with 'no-text'", async () => {
  const pane = createAdvicePane();
  await pane.run({ ...baseOpts, provider: chunkedStream([]), signal: new AbortController().signal });
  assert.equal(pane.state, "unavailable");
  assert.equal(pane.error, "no-text");
});

test("advice-pane: aborted before run moves to 'unavailable' with 'aborted'", async () => {
  const pane = createAdvicePane();
  const ac = new AbortController();
  ac.abort();
  await pane.run({ ...baseOpts, provider: fixedStream("ignored"), signal: ac.signal });
  assert.equal(pane.state, "unavailable");
  assert.equal(pane.error, "aborted");
});

test("advice-pane: onChunk callback fires per delta", async () => {
  const pane = createAdvicePane();
  const seen: string[] = [];
  const cbs: AdvicePaneCallbacks = { onChunk: (t) => seen.push(t) };
  await pane.run({ ...baseOpts, provider: chunkedStream(["x", "y"]), signal: new AbortController().signal, callbacks: cbs });
  assert.deepEqual(seen, ["x", "y"]);
});

test("advice-pane: insert into a fake session appends the buffer text", () => {
  const pane = createAdvicePane();
  pane.text = "draft advice";
  pane.state = "ok";
  const session = { messages: [] as string[], appendUserMessage(t: string) { this.messages.push(t); } };
  const ok = advicePaneInsert(pane, session);
  assert.equal(ok, true);
  assert.deepEqual(session.messages, ["draft advice"]);
});

test("advice-pane: insert is a no-op when the pane is empty", () => {
  const pane = createAdvicePane();
  const session = { messages: [] as string[], appendUserMessage(t: string) { this.messages.push(t); } };
  const ok = advicePaneInsert(pane, session);
  assert.equal(ok, false);
  assert.equal(session.messages.length, 0);
});

test("advice-pane: insert is a no-op when state is not 'ok'", () => {
  const pane = createAdvicePane();
  pane.text = "leftover";
  pane.state = "unavailable";
  const session = { messages: [] as string[], appendUserMessage(t: string) { this.messages.push(t); } };
  const ok = advicePaneInsert(pane, session);
  assert.equal(ok, false);
  assert.equal(session.messages.length, 0);
});

test("advice-pane: reset clears the buffer back to idle", () => {
  const pane = createAdvicePane();
  pane.text = "stuff";
  pane.state = "ok";
  pane.reset();
  assert.equal(pane.state, "idle");
  assert.equal(pane.text, "");
  assert.equal(pane.error, null);
});
