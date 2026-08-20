// whats-new.ts
// Changelog-delta discovery for the welcome "What's new" panel. The panel
// shows released-version changelog entries newer than the last version the
// user saw; the in-development `[Unreleased]` section is intentionally
// skipped until it ships in a released version.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getAgentPath } from "../paths/agent-dirs.ts";

const MAX_WHATSNEW_LINES = 8;
const WHATS_NEW_STATE_FILE = "whats-new.json";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function parseVersion(version: string): number[] | null {
  const match = version.trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

function isVersionNewer(version: string, lastSeen: string | null): boolean {
  if (lastSeen === null) return true;
  const next = parseVersion(version);
  const seen = parseVersion(lastSeen);
  if (!next || !seen) return false;
  for (let i = 0; i < 3; i++) {
    if (next[i] > seen[i]) return true;
    if (next[i] < seen[i]) return false;
  }
  return false;
}

/**
 * Extract the bullet lines from released changelog sections whose version is
 * strictly newer than `lastSeenVersion` (null = first run, so the newest
 * sections win). Markdown bold markers are stripped; backticks are kept so
 * commands like `/powerline doctor` stay readable in the terminal.
 */
export function parseChangelogDelta(
  changelog: string,
  lastSeenVersion: string | null,
  maxLines: number = MAX_WHATSNEW_LINES,
): string[] {
  const entries: string[] = [];
  let includeSection = false;

  for (const rawLine of changelog.split("\n")) {
    const line = rawLine.trimEnd();
    const versionMatch = line.match(/^##\s+\[([^\]]+)\]/);
    if (versionMatch) {
      const version = versionMatch[1].trim();
      includeSection =
        version !== "Unreleased" && isVersionNewer(version, lastSeenVersion);
      continue;
    }
    if (!includeSection) continue;
    if (!line.startsWith("- ")) continue;

    const cleaned = line.slice(2).trim().replace(/\*\*/g, "").trim();
    if (!cleaned) continue;
    entries.push(cleaned);
    if (entries.length >= maxLines) break;
  }

  return entries;
}

function resolveChangelogPath(): string | null {
  const candidates = [
    join(PACKAGE_ROOT, "CHANGELOG.md"),
    join(process.cwd(), "CHANGELOG.md"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function readCurrentVersion(): string | null {
  try {
    const packagePath = join(PACKAGE_ROOT, "package.json");
    if (!existsSync(packagePath)) return null;
    const pkg: unknown = JSON.parse(readFileSync(packagePath, "utf8"));
    if (typeof pkg !== "object" || pkg === null) return null;
    const version = (pkg as { version?: unknown }).version;
    return typeof version === "string" && version.trim() ? version.trim() : null;
  } catch {
    return null;
  }
}

function whatsNewStatePath(): string {
  return getAgentPath("powerline-footer", WHATS_NEW_STATE_FILE);
}

function loadLastSeenVersion(): string | null {
  try {
    const statePath = whatsNewStatePath();
    if (!existsSync(statePath)) return null;
    const state: unknown = JSON.parse(readFileSync(statePath, "utf8"));
    if (typeof state !== "object" || state === null) return null;
    const seenVersion = (state as { seenVersion?: unknown }).seenVersion;
    return typeof seenVersion === "string" ? seenVersion : null;
  } catch {
    return null;
  }
}

function saveLastSeenVersion(version: string): void {
  try {
    const statePath = whatsNewStatePath();
    mkdirSync(dirname(statePath), { recursive: true });
    writeFileSync(
      statePath,
      JSON.stringify({ seenVersion: version }) + "\n",
      "utf8",
    );
  } catch (error) {
    console.debug("[wishcraft] Failed to persist whats-new state:", error);
  }
}

/**
 * Read the packaged CHANGELOG, diff it against the last seen version, mark the
 * current version seen, and return the (capped) bullet lines for the welcome
 * panel. Returns `[]` when there is no changelog, no delta, or no package
 * version (e.g. unpackaged source runs).
 */
export function discoverWhatsNew(): string[] {
  const changelogPath = resolveChangelogPath();
  if (!changelogPath) return [];

  const currentVersion = readCurrentVersion();
  if (!currentVersion) return [];

  let changelog: string;
  try {
    changelog = readFileSync(changelogPath, "utf8");
  } catch {
    return [];
  }

  const lastSeen = loadLastSeenVersion();
  const entries = parseChangelogDelta(changelog, lastSeen);
  if (lastSeen !== currentVersion) {
    saveLastSeenVersion(currentVersion);
  }
  return entries;
}
