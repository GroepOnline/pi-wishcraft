import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer, type Server } from "node:http";
import { extractRepos } from "../src/studio/deepwiki/extract.ts";
import {
  readCacheEntry,
  writeCacheEntry,
  resolveCacheDir,
  withCache,
} from "../src/studio/deepwiki/cache.ts";
import { callTool } from "../src/studio/deepwiki/client.ts";

test("extractRepos: GitHub URLs and bare owner/repo mentions are picked up", () => {
  const body = "see https://github.com/Earendil-Works/pi and also vercel/next.js for context";
  const repos = extractRepos(body);
  const keys = repos.map((r) => `${r.owner}/${r.repo}`).sort();
  assert.deepEqual(keys, ["Earendil-Works/pi", "vercel/next.js"]);
});

test("extractRepos: deduplicates repeated mentions", () => {
  const repos = extractRepos("pi-ai/pi-ai is the same as https://github.com/pi-ai/pi-ai");
  assert.equal(repos.length, 1);
});

test("extractRepos: noise that looks like a path is not a repo", () => {
  const repos = extractRepos("open ./foo/bar.ts and read docs/intro.md");
  assert.equal(repos.length, 0);
});

test("extractRepos: a URL with a path component still surfaces the canonical repo", () => {
  const repos = extractRepos("https://github.com/foo/bar/blob/main/README.md");
  const canonical = repos.find((r) => r.owner === "foo" && r.repo === "bar");
  assert.ok(canonical, "canonical foo/bar must be in the result");
});

test("cache: write then read within TTL returns the stored data without network", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dw-cache-"));
  const repo = { owner: "x", repo: "y" };
  await writeCacheEntry(dir, repo, { content: "hello" }, { ttlMs: 60_000 });
  const result = await readCacheEntry(dir, repo, { ttlMs: 60_000 });
  assert.equal(result.status, "hit");
  assert.equal(result.stale, false);
  assert.equal(result.entry?.data.content, "hello");
});

test("cache: expired entry falls back to refresh; network fail with no fresh cache returns miss", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dw-cache-"));
  const repo = { owner: "x", repo: "y" };
  await writeCacheEntry(dir, repo, { content: "old" }, { ttlMs: 60_000 });
  const result = await withCache(dir, repo, { ttlMs: 1, now: Date.now() + 10_000 }, async () => {
    throw new Error("network down");
  });
  assert.equal(result.status, "miss");
  assert.equal(result.stale, true);
  assert.equal(result.entry?.data.content, "old");
});

test("cache: expired entry with successful refresh returns the fresh hit", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dw-cache-"));
  const repo = { owner: "x", repo: "y" };
  await writeCacheEntry(dir, repo, { content: "old" }, { ttlMs: 60_000 });
  const result = await withCache(dir, repo, { ttlMs: 1, now: Date.now() + 10_000 }, async () => ({ content: "new" }));
  assert.equal(result.status, "hit");
  assert.equal(result.stale, false);
  assert.equal(result.entry?.data.content, "new");
});

test("cache: disk file is created under the expected path", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dw-cache-"));
  const repo = { owner: "foo", repo: "bar" };
  await writeCacheEntry(dir, repo, { content: "x" }, { ttlMs: 60_000 });
  const file = join(dir, "foo", "bar.json");
  assert.ok(existsSync(file));
  const raw = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(raw.data.content, "x");
});

test("resolveCacheDir: defaults to ~/.pi/agent/wishcraft-cache/deepwiki when no override", () => {
  const resolved = resolveCacheDir();
  assert.match(resolved, /wishcraft-cache\/deepwiki$/);
});

test("client: handshake + tool call against a local faux MCP server", async () => {
  let server: Server | undefined;
  let receivedInitialize = false;
  let receivedTool = false;
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c: Buffer) => (body += c.toString("utf8")));
    req.on("end", () => {
      const parsed = JSON.parse(body) as { method: string; params?: unknown };
      if (parsed.method === "initialize") {
        receivedInitialize = true;
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 0,
            result: { protocolVersion: "2024-11-05", capabilities: {} },
          }),
        );
        return;
      }
      if (parsed.method === "tools/call") {
        receivedTool = true;
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: { content: [{ type: "text", text: "wiki-content" }] },
          }),
        );
        return;
      }
      res.statusCode = 404;
      res.end();
    });
  });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  const url = `http://127.0.0.1:${addr.port}/mcp`;
  const result = await callTool("read_wiki_structure", { repo: "foo/bar" }, url);
  assert.equal(receivedInitialize, true);
  assert.equal(receivedTool, true);
  assert.equal((result as { content: { text: string }[] }).content[0]?.text, "wiki-content");
  server.close();
});
