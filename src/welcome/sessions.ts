import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { getAgentSessionDirs } from "../paths/agent-dirs.ts";
import { logDiscoveryError } from "./discover.ts";
import { formatTimeAgo } from "./format.ts";
import type { RecentSession } from "./types.ts";

const MAX_HEADER_SIZE = 8192;

interface SessionRecord {
  name: string;
  mtime: number;
}

function parseProjectNameFromHeader(filePath: string): string | null {
  try {
    const buffer = readFileSync(filePath);
    const bytesToRead = Math.min(buffer.length, MAX_HEADER_SIZE);
    const firstLine = buffer
      .toString("utf8", 0, bytesToRead)
      .split(/\r?\n/, 1)[0]
      ?.trim();
      
    if (!firstLine) return null;

    const header: unknown = JSON.parse(firstLine);
    
    if (typeof header !== "object" || header === null) return null;
    if (!("cwd" in header)) return null;
    
    const cwd = (header as { cwd: unknown }).cwd;
    if (typeof cwd !== "string" || cwd.trim().length === 0) return null;

    return basename(cwd) || cwd;
  } catch {
    return null;
  }
}

function extractProjectNameFromDir(dir: string): string {
  const parentName = basename(dir);
  if (!parentName.startsWith("--")) {
    return parentName;
  }

  const parts = parentName.split("-").filter(Boolean);
  return parts[parts.length - 1] || parentName;
}

function scanSessionDirectory(dir: string, sessions: SessionRecord[]): void {
  if (!existsSync(dir)) return;
  
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const entryPath = join(dir, entry);
      try {
        const stats = statSync(entryPath);
        if (stats.isDirectory()) {
          scanSessionDirectory(entryPath, sessions);
        } else if (entry.endsWith(".jsonl")) {
          const projectName =
            parseProjectNameFromHeader(entryPath) ??
            extractProjectNameFromDir(dir);
          sessions.push({ name: projectName, mtime: stats.mtimeMs });
        }
      } catch (error) {
        logDiscoveryError(`Failed to inspect session entry ${entryPath}`, error);
      }
    }
  } catch (error) {
    logDiscoveryError(`Failed to scan sessions dir ${dir}`, error);
  }
}

function filterAndFormatSessions(sessions: SessionRecord[], maxCount: number): RecentSession[] {
  if (sessions.length === 0) return [];

  sessions.sort((a, b) => b.mtime - a.mtime);

  const seen = new Set<string>();
  const uniqueSessions: SessionRecord[] = [];
  
  for (const s of sessions) {
    if (!seen.has(s.name)) {
      seen.add(s.name);
      uniqueSessions.push(s);
    }
  }

  const now = Date.now();
  return uniqueSessions.slice(0, maxCount).map((s) => ({
    name: s.name.length > 20 ? s.name.slice(0, 17) + "…" : s.name,
    timeAgo: formatTimeAgo(now - s.mtime),
  }));
}

export function getRecentSessions(maxCount: number = 3): RecentSession[] {
  const sessionsDirs = getAgentSessionDirs();
  const sessions: SessionRecord[] = [];

  for (const dir of sessionsDirs) {
    scanSessionDirectory(dir, sessions);
  }

  return filterAndFormatSessions(sessions, maxCount);
}
