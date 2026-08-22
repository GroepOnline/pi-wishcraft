---
name: wishcraft-hot-path-rules
description: Performance contract for pi-wishcraft hot paths. Use when writing or reviewing code that runs in the status line render loop, segments, or any per-keystroke/per-tick path — to avoid sync I/O, execSync, and unbounded scans that stall the ~33ms render cadence.
---

# Hot path rules (perf contract)

The status line re-renders on a `STATUS_RENDER_DEBOUNCE_MS = 33` debounce
(`src/extension/core/constants.ts`). Anything on the render path must stay
well under one frame. Three hard rules:

## 1. No sync fs reads in the render path

Reads happen once, then an **mtime cache** short-circuits repeats —
`src/usage/usage-store.ts`:

```ts
// GOOD: stat is cheap; file is parsed only when mtime changed
let cachedRead: { path: string; mtime: number; file: UsageFile } | null = null;
export function loadUsageFileFromDisk(path = usageFilePath()): UsageFile {
  const mtime = statSync(path).mtimeMs;
  if (cachedRead && cachedRead.path === path && cachedRead.mtime === mtime) {
    return cachedRead.file;            // hit: no readFileSync
  }
  const file = JSON.parse(readFileSync(path, "utf8")) as UsageFile;
  cachedRead = { path, mtime, file };
  return file;
}
```

```ts
// BAD: parses the whole file every render tick
export function loadUsage(): UsageFile {
  return JSON.parse(readFileSync(usageFilePath(), "utf8"));
}
```

## 2. No execSync in segments — async spawn + serve-stale

`src/git/status.ts` spawns git asynchronously, caches per TTL
(status 1s / branch 0.5s / remote 60s), and **keeps serving the stale value**
while a refresh is in flight:

```ts
// GOOD (src/git/status.ts): stale cache renders now, spawn refreshes
const proc = spawn("git", args, { /* … */ });
// on completion: cachedStatus = …; notify listeners → debounced re-render
if (cachedStatus) cachedStatus.timestamp = 0; // expire, keep serving stale
```

```ts
// BAD: blocks the event loop (and the renderer) per segment per tick
const staged = execSync("git diff --cached --numstat | wc -l").toString();
```

## 3. Cap session scans by bytes and count

Never read a session file whole or walk unbounded trees:
`src/welcome/sessions.ts` caps header parsing at `MAX_HEADER_SIZE = 8192`
bytes and dedupes/slices results (`slice(0, maxCount)`); history modules cap
at `PROMPT_HISTORY_LIMIT` / `STASH_HISTORY_LIMIT`
(`src/extension/core/constants.ts`). New scans need an explicit byte and/or
item limit.

## Review checklist

- [ ] No `readFileSync`/`readdirSync` uncached on the render path
- [ ] No `execSync`/`spawnSync` anywhere under `src/segments/`, `src/extension/ui/`
- [ ] Background work lands via listener → `STATUS_RENDER_DEBOUNCE_MS` debounce
- [ ] Scans bounded by byte cap + result cap

Details: `docs/semantic/HOT-PATHS.md` (owned by another agent).
