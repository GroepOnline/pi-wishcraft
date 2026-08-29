import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildAdviseContext, capContextByChars } from "../src/studio/advise/context.ts";
import { buildPrompt } from "../src/studio/advise/prompts.ts";
import { runAdvice, type AdviseStreamProvider } from "../src/studio/advise/engine.ts";

test("context: priority body > references > wiki when under cap", () => {
  const ctx = buildAdviseContext({
    body: "body-content",
    references: [{ name: "r1", content: "ref1-content" }],
    wiki: [{ name: "w1", content: "wiki1-content" }],
    maxChars: 10_000,
  });
  assert.equal(ctx.body, "body-content");
  assert.equal(ctx.references[0]?.content, "ref1-content");
  assert.equal(ctx.wiki[0]?.content, "wiki1-content");
  assert.equal(ctx.dropped.wiki, 0);
  assert.equal(ctx.dropped.references, 0);
});

test("context: wiki sections are dropped first when over cap", () => {
  const wiki = Array.from({ length: 20 }, (_, i) => ({
    name: `w${i}`,
    content: "x".repeat(500),
  }));
  const ctx = buildAdviseContext({
    body: "BODY",
    references: [],
    wiki,
    maxChars: 1500,
  });
  assert.equal(ctx.body, "BODY");
  assert.ok(ctx.wiki.length < wiki.length, "wiki must be truncated");
  assert.ok(ctx.dropped.wiki > 0, "drop counter must record dropped wiki");
});

test("context: references are dropped when budget has no room", () => {
  const ctx = buildAdviseContext({
    body: "BODY",
    references: [{ name: "r1", content: "x".repeat(500) }],
    wiki: [],
    maxChars: 4, // body alone fills the budget
  });
  assert.equal(ctx.references.length, 0);
  assert.ok(ctx.dropped.references >= 1);
});

test("capContextByChars: keeps full content when within cap", () => {
  const out = capContextByChars("hello", 100);
  assert.equal(out.content, "hello");
  assert.equal(out.truncated, false);
});

test("capContextByChars: truncates with marker when over cap", () => {
  const out = capContextByChars("x".repeat(200), 50);
  assert.equal(out.content.length, 50);
  assert.equal(out.truncated, true);
});

test("prompts: explain mode prompt includes the body and references", () => {
  const prompt = buildPrompt("explain", {
    skillName: "alpha",
    body: "alpha-body",
    references: [{ name: "ref.md", content: "ref-content" }],
    wiki: [],
  });
  assert.match(prompt.user, /alpha-body/);
  assert.match(prompt.user, /ref-content/);
  assert.match(prompt.user, /Skill: alpha/);
});

test("prompts: integrate mode prompt emphasizes wiring", () => {
  const prompt = buildPrompt("integrate", {
    skillName: "alpha",
    body: "alpha-body",
    references: [],
    wiki: [],
  });
  assert.match(prompt.user, /integrate|wir/i);
  assert.match(prompt.system, /English/i);
});

function chunkedStream(chunks: string[]): AdviseStreamProvider {
  return {
    stream: async function* () {
      for (const c of chunks) {
        yield { delta: c };
      }
    },
  };
}

test("engine: no provider returns an unavailable result instead of throwing", async () => {
  const result = await runAdvice({
    mode: "explain",
    skillName: "alpha",
    body: "alpha-body",
    references: [],
    wiki: [],
    provider: null,
    signal: new AbortController().signal,
  });
  assert.equal(result.kind, "unavailable");
  if (result.kind === "unavailable") {
    assert.equal(result.reason, "no-model");
  }
});

test("engine: provider streams a response, onChunk receives every delta", async () => {
  const ac = new AbortController();
  const collected: string[] = [];
  const result = await runAdvice({
    mode: "explain",
    skillName: "alpha",
    body: "alpha-body",
    references: [],
    wiki: [],
    provider: chunkedStream(["hello ", "world"]),
    signal: ac.signal,
    onChunk: (text) => collected.push(text),
  });
  assert.equal(result.kind, "ok");
  if (result.kind === "ok") {
    assert.equal(result.text, "hello world");
  }
  assert.deepEqual(collected, ["hello ", "world"]);
  ac.abort();
});

test("engine: aborted signal before call returns 'aborted'", async () => {
  const ac = new AbortController();
  ac.abort();
  const result = await runAdvice({
    mode: "explain",
    skillName: "alpha",
    body: "alpha-body",
    references: [],
    wiki: [],
    provider: chunkedStream(["never"]),
    signal: ac.signal,
  });
  assert.equal(result.kind, "unavailable");
  if (result.kind === "unavailable") {
    assert.equal(result.reason, "aborted");
  }
});

test("engine: empty stream returns 'no-text' instead of an empty ok", async () => {
  const result = await runAdvice({
    mode: "explain",
    skillName: "alpha",
    body: "alpha-body",
    references: [],
    wiki: [],
    provider: chunkedStream([]),
    signal: new AbortController().signal,
  });
  assert.equal(result.kind, "unavailable");
  if (result.kind === "unavailable") {
    assert.equal(result.reason, "no-text");
  }
});

test("engine: modules expose only English operator strings", () => {
  const modules = [
    "../src/studio/advise/engine.ts",
    "../src/studio/advise/prompts.ts",
    "../src/studio/advise/context.ts",
  ];
  const dutch = /\b(leg uit|installeer|gebruik|advies|vaardigheid)\b/i;
  for (const rel of modules) {
    const src = readFileSync(join(import.meta.dirname, rel), "utf8");
    assert.doesNotMatch(src, dutch, `${rel} must keep operator strings English`);
  }
});
