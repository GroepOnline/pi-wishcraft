import assert from "node:assert/strict";
import test from "node:test";
import { runSegmentPipeline, type PipelineSegment, type PipelineSource } from "../src/segments/pipeline.ts";

const baseCtx = () => ({ version: "ctx-v1" });

const makeSegment = (id: string, render: PipelineSegment["render"]): PipelineSegment => ({ id, render });
const makeSource = (id: string, render: PipelineSource["render"]): PipelineSource => ({ id, render });

test("pipeline: builtin segment renders and is included in the output", async () => {
  const seg = makeSegment("ok", () => ({ content: "hello", visible: true }));
  const out = await runSegmentPipeline([seg], [], baseCtx());
  assert.equal(out.length, 1);
  assert.equal(out[0]?.id, "ok");
  assert.equal(out[0]?.content, "hello");
  assert.equal(out[0]?.cached, false);
});

test("pipeline: throwing builtin segment is fault-isolated and siblings still render", async () => {
  const segA = makeSegment("a", () => ({ content: "A", visible: true }));
  const segB = makeSegment("b", () => { throw new Error("boom"); });
  const segC = makeSegment("c", () => ({ content: "C", visible: true }));
  const out = await runSegmentPipeline([segA, segB, segC], [], baseCtx());
  const ids = out.map((s) => s.id);
  assert.deepEqual(ids, ["a", "c"]);
});

test("pipeline: contributed source with empty output is skipped", async () => {
  const seg = makeSegment("ok", () => ({ content: "A", visible: true }));
  const source = makeSource("contrib", () => "");
  const out = await runSegmentPipeline([seg], [source], baseCtx());
  assert.equal(out.length, 1);
  assert.equal(out[0]?.id, "ok");
});

test("pipeline: contributed source throwing is fault-isolated like builtins", async () => {
  const seg = makeSegment("ok", () => ({ content: "A", visible: true }));
  const source = makeSource("bad", () => { throw new Error("nope"); });
  const out = await runSegmentPipeline([seg], [source], baseCtx());
  assert.equal(out.length, 1);
  assert.equal(out[0]?.id, "ok");
});

test("pipeline: cache reuse when context version is unchanged", async () => {
  let calls = 0;
  const seg = makeSegment("counted", () => { calls += 1; return { content: `v${calls}`, visible: true }; });
  const ctx = baseCtx();
  const a = await runSegmentPipeline([seg], [], ctx, { cache: true });
  const b = await runSegmentPipeline([seg], [], ctx, { cache: true });
  assert.equal(a[0]?.content, "v1");
  assert.equal(b[0]?.content, "v1");
  assert.equal(b[0]?.cached, true);
  assert.equal(calls, 1);
});

test("pipeline: cache invalidates when context version changes", async () => {
  let calls = 0;
  const seg = makeSegment("counted", () => { calls += 1; return { content: `v${calls}`, visible: true }; });
  const a = await runSegmentPipeline([seg], [], { version: "v1" }, { cache: true });
  const b = await runSegmentPipeline([seg], [], { version: "v2" }, { cache: true });
  assert.equal(a[0]?.content, "v1");
  assert.equal(b[0]?.content, "v2");
  assert.equal(calls, 2);
});

test("pipeline: segment exceeding render budget is hidden (degraded)", async () => {
  const slow = makeSegment("slow", async () => {
    await new Promise((r) => setTimeout(r, 50));
    return { content: "SLOW", visible: true };
  });
  const out = await runSegmentPipeline([slow], [], baseCtx(), { budgetMs: 5 });
  assert.equal(out.length, 1);
  assert.equal(out[0]?.visible, false);
});

test("pipeline: builtin and contributed go through the same try/catch + cache entry", async () => {
  let builtins = 0;
  let sources = 0;
  const seg = makeSegment("b", () => { builtins += 1; return { content: "B", visible: true }; });
  const source = makeSource("c", () => { sources += 1; return "C"; });
  const ctx = baseCtx();
  const a = await runSegmentPipeline([seg], [source], ctx, { cache: true });
  const b = await runSegmentPipeline([seg], [source], ctx, { cache: true });
  assert.equal(a.length, 2);
  assert.equal(b.length, 2);
  assert.equal(b[0]?.cached, true);
  assert.equal(b[1]?.cached, true);
  assert.equal(builtins, 1);
  assert.equal(sources, 1);
});
