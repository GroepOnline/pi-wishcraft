/** DeepWiki disk cache (U9). TTL + stale fallback + bounded LRU eviction. */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { getAgentPath } from "../../paths/agent-dirs.ts";
import type { RepoRef } from "./extract.ts";

const DEFAULT_MAX_ENTRIES = 64;

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

export interface CacheOptions {
  ttlMs: number;
  now?: number;
  maxEntries?: number;
}

function fileFor(dir: string, repo: RepoRef): string {
  return join(dir, repo.owner, `${repo.repo}.json`);
}

function cacheFiles(dir: string): string[] {
  const files: string[] = [];
  let owners: string[];
  try {
    owners = readdirSync(dir);
  } catch {
    return files;
  }
  for (const owner of owners) {
    const ownerDir = join(dir, owner);
    let entries: string[];
    try {
      entries = readdirSync(ownerDir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.endsWith(".json")) files.push(join(ownerDir, entry));
    }
  }
  return files;
}

/** Remove least-recently-used entries until the cache is within its cap. */
export function evictCacheEntries(dir: string, maxEntries = DEFAULT_MAX_ENTRIES): void {
  const cap = Math.max(1, Math.floor(maxEntries));
  const files = cacheFiles(dir);
  if (files.length <= cap) return;
  const ordered = files
    .map((file) => {
      try {
        return { file, atimeMs: statSync(file).atimeMs, mtimeMs: statSync(file).mtimeMs };
      } catch {
        return { file, atimeMs: 0, mtimeMs: 0 };
      }
    })
    .sort((a, b) => (a.atimeMs - b.atimeMs) || (a.mtimeMs - b.mtimeMs));
  for (const item of ordered.slice(0, files.length - cap)) {
    try {
      unlinkSync(item.file);
    } catch {
      // A concurrent cleanup must not break advice or cache reads.
    }
  }
}

function touch(file: string, now: number): void {
  try {
    const date = new Date(now);
    utimesSync(file, date, date);
  } catch {
    // Cache recency is best-effort metadata.
  }
}

export async function writeCacheEntry<T>(
  dir: string,
  repo: RepoRef,
  data: T,
  options: CacheOptions,
): Promise<void> {
  const now = options.now ?? Date.now();
  const file = fileFor(dir, repo);
  mkdirSync(join(dir, repo.owner), { recursive: true });
  writeFileSync(file, JSON.stringify({ savedAt: now, data }), "utf8");
  touch(file, now);
  evictCacheEntries(dir, options.maxEntries);
}

export async function readCacheEntry<T>(
  dir: string,
  repo: RepoRef,
  options: CacheOptions,
): Promise<CacheReadResult<T>> {
  const now = options.now ?? Date.now();
  const file = fileFor(dir, repo);
  if (!existsSync(file)) return { status: "miss", stale: false, entry: null };
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as CacheFile<T>;
    touch(file, now);
    const fresh = now - raw.savedAt <= options.ttlMs;
    return { status: fresh ? "hit" : "miss", stale: !fresh, entry: raw };
  } catch {
    return { status: "miss", stale: false, entry: null };
  }
}

export async function withCache<T>(
  dir: string,
  repo: RepoRef,
  options: CacheOptions,
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
