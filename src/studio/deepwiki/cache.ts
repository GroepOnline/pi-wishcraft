/** DeepWiki disk cache (U9). TTL + stale fallback, no LRU (ponytail: add when
 *  the cache directory count actually grows). */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getAgentPath } from "../../paths/agent-dirs.ts";
import type { RepoRef } from "./extract.ts";

export function resolveCacheDir(override?: string): string {
  return override ?? getAgentPath("wishcraft-cache", "deepwiki");
}

export interface CacheFile<T> {
  savedAt: number;
  data: T;
}

export interface CacheReadResult<T> {
  status: "hit" | "miss";
  stale: boolean;
  entry: CacheFile<T> | null;
}

function fileFor(dir: string, repo: RepoRef): string {
  return join(dir, repo.owner, `${repo.repo}.json`);
}

export async function writeCacheEntry<T>(
  dir: string,
  repo: RepoRef,
  data: T,
  options: { ttlMs: number; now?: number },
): Promise<void> {
  const now = options.now ?? Date.now();
  const file = fileFor(dir, repo);
  mkdirSync(join(dir, repo.owner), { recursive: true });
  writeFileSync(file, JSON.stringify({ savedAt: now, data }), "utf8");
}

export async function readCacheEntry<T>(
  dir: string,
  repo: RepoRef,
  options: { ttlMs: number; now?: number },
): Promise<CacheReadResult<T>> {
  const now = options.now ?? Date.now();
  const file = fileFor(dir, repo);
  if (!existsSync(file)) return { status: "miss", stale: false, entry: null };
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as CacheFile<T>;
    const fresh = now - raw.savedAt <= options.ttlMs;
    return { status: fresh ? "hit" : "miss", stale: !fresh, entry: raw };
  } catch {
    return { status: "miss", stale: false, entry: null };
  }
}

export async function withCache<T>(
  dir: string,
  repo: RepoRef,
  options: { ttlMs: number; now?: number },
  networkFetch: () => Promise<T>,
): Promise<CacheReadResult<T>> {
  const fresh = await readCacheEntry<T>(dir, repo, options);
  if (fresh.status === "hit") return fresh;
  try {
    const data = await networkFetch();
    await writeCacheEntry(dir, repo, data, options);
    const read = await readCacheEntry<T>(dir, repo, { ...options, now: Date.now() });
    return read;
  } catch {
    if (fresh.entry) return { status: "miss", stale: true, entry: fresh.entry };
    return { status: "miss", stale: false, entry: null };
  }
}
