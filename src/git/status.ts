import { spawn } from "node:child_process";
import type { GitStatus } from "../config/types.ts";

interface CachedGitStatus {
  staged: number;
  unstaged: number;
  untracked: number;
  ahead: number;
  behind: number;
  commit: { short: string; subject: string } | null;
  timestamp: number;
}

interface CachedBranch {
  branch: string | null;
  timestamp: number;
}

export type GitPollingMode = "full" | "branch" | "off";

/** Known git hosting providers we render a dedicated icon for. */
export type GitHost = "github" | "gitlab" | "bitbucket" | "other";

interface CachedRemoteHost {
  host: GitHost | null;
  timestamp: number;
}

const CACHE_TTL_MS = 1000; // 1 second for file status
const BRANCH_TTL_MS = 500; // Shorter TTL so branch updates quickly after invalidation
const REMOTE_TTL_MS = 60_000; // Origin remote almost never changes within a session
let cachedStatus: CachedGitStatus | null = null;
let cachedBranch: CachedBranch | null = null;
let cachedRemoteHost: CachedRemoteHost | null = null;
let pendingRemoteFetch: Promise<void> | null = null;
let pendingFetch: Promise<void> | null = null;
let pendingBranchFetch: Promise<void> | null = null;
let invalidationCounter = 0; // Track invalidations to prevent stale updates
let branchInvalidationCounter = 0;
const updateListeners = new Set<() => void>();

function notifyGitUpdate(): void {
  for (const listener of updateListeners) listener();
}

export function subscribeGitUpdates(listener: () => void): () => void {
  updateListeners.add(listener);
  return () => updateListeners.delete(listener);
}

/**
 * Parse git status --porcelain output
 *
 * Format: XY filename
 * X = index status, Y = working tree status
 * ?? = untracked
 * Other X values = staged
 * Other Y values = unstaged
 */
function parseGitStatusOutput(output: string): {
  staged: number;
  unstaged: number;
  untracked: number;
} {
  let staged = 0;
  let unstaged = 0;
  let untracked = 0;

  for (const line of output.split("\n")) {
    if (!line) continue;
    const x = line[0];
    const y = line[1];

    if (x === "?" && y === "?") {
      untracked++;
      continue;
    }

    // X position (index/staged)
    if (x && x !== " " && x !== "?") {
      staged++;
    }

    // Y position (working tree/unstaged)
    if (y && y !== " ") {
      unstaged++;
    }
  }

  return { staged, unstaged, untracked };
}

function runGit(args: string[], timeoutMs = 200): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn("git", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let resolved = false;

    const finish = (result: string | null) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutId);
      resolve(result);
    };

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.on("close", (code) => {
      finish(code === 0 ? stdout.trim() : null);
    });

    proc.on("error", () => {
      finish(null);
    });

    const timeoutId = setTimeout(() => {
      proc.kill();
      finish(null);
    }, timeoutMs);
  });
}

/**
 * Fetch current git branch asynchronously.
 * For detached HEAD, returns the short commit SHA (matches provider's "detached" behavior).
 */
async function fetchGitBranch(): Promise<string | null> {
  const branch = await runGit(["branch", "--show-current"]);
  if (branch === null) return null;
  if (branch) return branch;

  const sha = await runGit(["rev-parse", "--short", "HEAD"]);
  return sha ? `${sha} (detached)` : "detached";
}

/**
 * Classify an origin remote URL into a known hosting provider. Handles both
 * SSH (`git@host:owner/repo`, `ssh://git@host/…`) and HTTP(S) forms, and
 * treats sub-domains (e.g. `www.github.com`) and any non-empty remote we
 * don't recognize as a generic git host.
 */
export function detectGitHost(remoteUrl: string | null): GitHost | null {
  if (!remoteUrl) return null;
  const trimmed = remoteUrl.trim();
  if (!trimmed) return null;

  let host: string;
  const scpLike = /^[^/@]+@([^:/]+):/.exec(trimmed);
  if (scpLike) {
    host = scpLike[1]!;
  } else {
    try {
      host = new URL(trimmed).hostname;
    } catch {
      return "other";
    }
  }

  host = host.toLowerCase().replace(/^www\./, "");
  if (host === "github.com" || host.endsWith(".github.com")) return "github";
  if (host === "gitlab.com" || host.endsWith(".gitlab.com")) return "gitlab";
  if (host === "bitbucket.org" || host.endsWith(".bitbucket.org"))
    return "bitbucket";
  return "other";
}

/**
 * Fetch the origin remote host asynchronously and cache the result.
 */
async function fetchRemoteHost(): Promise<GitHost | null> {
  const url = await runGit(["remote", "get-url", "origin"]);
  return detectGitHost(url);
}

/**
 * Get the origin remote's hosting provider with a long TTL cache. Returns the
 * cached value immediately (or null before the first fetch completes) and
 * refreshes in the background, matching the branch/status caching pattern.
 */
export function getGitRemoteHost(): GitHost | null {
  const now = Date.now();
  if (cachedRemoteHost && now - cachedRemoteHost.timestamp < REMOTE_TTL_MS) {
    return cachedRemoteHost.host;
  }

  if (!pendingRemoteFetch) {
    pendingRemoteFetch = fetchRemoteHost()
      .then((host) => {
        cachedRemoteHost = { host, timestamp: Date.now() };
        notifyGitUpdate();
      })
      .catch(() => {
        cachedRemoteHost = { host: null, timestamp: Date.now() };
        notifyGitUpdate();
      })
      .finally(() => {
        pendingRemoteFetch = null;
      });
  }

  return cachedRemoteHost ? cachedRemoteHost.host : null;
}

/**
 * Fetch git status asynchronously (dirty counts, upstream ahead/behind, and the
 * latest commit on HEAD). Runs alongside the branch fetch; all results are
 * cached behind a short TTL so the synchronous render path stays fast.
 */
async function fetchGitStatus(): Promise<{
  staged: number;
  unstaged: number;
  untracked: number;
  ahead: number;
  behind: number;
  commit: { short: string; subject: string } | null;
} | null> {
  const [statusOut, commitOut, aheadOut] = await Promise.all([
    runGit(["status", "--porcelain"], 500),
    runGit(["log", "-1", "--format=%h%x09%s"], 500),
    runGit(["rev-list", "--left-right", "--count", "HEAD...@{upstream}"], 500),
  ]);
  if (statusOut === null) return null;

  const counts = parseGitStatusOutput(statusOut);
  const aheadBehind = parseAheadBehind(aheadOut);
  return {
    ...counts,
    ahead: aheadBehind?.ahead ?? 0,
    behind: aheadBehind?.behind ?? 0,
    commit: parseCommitLine(commitOut),
  };
}

/** Parse `git log -1 --format=%h%x09%s` output into a short hash + subject. */
function parseCommitLine(
  output: string | null,
): { short: string; subject: string } | null {
  if (!output) return null;
  const sep = output.indexOf("\t");
  const short =
    (sep === -1 ? output.slice(0, 7) : output.slice(0, sep)).trim() || "?";
  const subject = sep === -1 ? "" : output.slice(sep + 1);
  return { short, subject };
}

/**
 * Parse `git rev-list --left-right --count HEAD...@{upstream}` output.
 * Format is "<left> <right>" where left counts commits reachable from HEAD but
 * not upstream (ahead) and right counts upstream-only commits (behind).
 */
function parseAheadBehind(
  output: string | null,
): { ahead: number; behind: number } | null {
  if (!output) return null;
  const [left, right] = output.split(/\s+/);
  const ahead = Number(left);
  const behind = Number(right);
  if (!Number.isFinite(ahead) || !Number.isFinite(behind)) return null;
  return { ahead, behind };
}

/**
 * Get the current git branch with caching.
 * Falls back to provider branch if our cache is empty.
 */
export function getCurrentBranch(providerBranch: string | null): string | null {
  const now = Date.now();

  // Return cached if fresh
  if (cachedBranch && now - cachedBranch.timestamp < BRANCH_TTL_MS) {
    return cachedBranch.branch;
  }

  // Trigger background fetch if not already pending
  if (!pendingBranchFetch) {
    const fetchId = branchInvalidationCounter;
    pendingBranchFetch = fetchGitBranch().then((result) => {
      // Cache result if no invalidation happened (including null for non-git dirs)
      if (fetchId === branchInvalidationCounter) {
        cachedBranch = {
          branch: result,
          timestamp: Date.now(),
        };
        notifyGitUpdate();
      }
      pendingBranchFetch = null;
    });
  }

  // Return stale cache while refreshing; only use provider before first fetch
  return cachedBranch ? cachedBranch.branch : providerBranch;
}

/**
 * Get git status with caching.
 * Returns cached value if within TTL, otherwise triggers async fetch.
 * This is designed for synchronous render() calls - returns last known value
 * while refreshing in background.
 */
export function getGitStatus(
  providerBranch: string | null,
  pollingMode: GitPollingMode = "full",
): GitStatus {
  const now = Date.now();
  const branch =
    pollingMode === "off" ? providerBranch : getCurrentBranch(providerBranch);

  if (pollingMode !== "full") {
    return { branch, staged: 0, unstaged: 0, untracked: 0, ahead: 0, behind: 0, commit: null };
  }

  // Return cached if fresh
  if (cachedStatus && now - cachedStatus.timestamp < CACHE_TTL_MS) {
    return {
      branch,
      staged: cachedStatus.staged,
      unstaged: cachedStatus.unstaged,
      untracked: cachedStatus.untracked,
      ahead: cachedStatus.ahead,
      behind: cachedStatus.behind,
      commit: cachedStatus.commit,
    };
  }

  // Trigger background fetch if not already pending
  if (!pendingFetch) {
    const fetchId = invalidationCounter; // Capture current counter
    pendingFetch = fetchGitStatus().then((result) => {
      // Cache result if no invalidation happened (including null for non-git dirs)
      if (fetchId === invalidationCounter) {
        cachedStatus = result
          ? {
              staged: result.staged,
              unstaged: result.unstaged,
              untracked: result.untracked,
              ahead: result.ahead,
              behind: result.behind,
              commit: result.commit,
              timestamp: Date.now(),
            }
          : { staged: 0, unstaged: 0, untracked: 0, ahead: 0, behind: 0, commit: null, timestamp: Date.now() };
        notifyGitUpdate();
      }
      pendingFetch = null;
    });
  }

  // Return last cached or empty
  if (cachedStatus) {
    return {
      branch,
      staged: cachedStatus.staged,
      unstaged: cachedStatus.unstaged,
      untracked: cachedStatus.untracked,
      ahead: cachedStatus.ahead,
      behind: cachedStatus.behind,
      commit: cachedStatus.commit,
    };
  }

  return { branch, staged: 0, unstaged: 0, untracked: 0, ahead: 0, behind: 0, commit: null };
}

/**
 * Force refresh git status (call when you know files changed).
 * Serve-stale: keep the last known counts on screen while a background
 * refresh runs, instead of blanking the segment to zeros (footer flicker).
 */
export function invalidateGitStatus(): void {
  if (cachedStatus) cachedStatus.timestamp = 0; // expire, but keep serving the stale value
  invalidationCounter++; // Increment to invalidate any pending fetches
}

/**
 * Force refresh git branch (call when you know branch might have changed).
 * Serve-stale: keep showing the last known branch until the refresh lands.
 */
export function invalidateGitBranch(): void {
  if (cachedBranch) cachedBranch.timestamp = 0; // expire, but keep serving the stale value
  branchInvalidationCounter++;
  // The origin remote is repo-scoped, so a branch/cwd change may mean a
  // different repo; drop the host cache so it re-detects.
  cachedRemoteHost = null;
}
