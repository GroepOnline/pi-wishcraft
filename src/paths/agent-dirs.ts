import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

/**
 * Returns the current user's home directory.
 */
export function getHomeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || homedir();
}

/**
 * Normalizes a path string by expanding tildes and handling file:// URLs.
 */
export function normalizeAgentDirPath(value: string): string {
  const trimmed = value.trim();
  
  if (trimmed.startsWith("file://")) {
    return fileURLToPath(new URL(trimmed));
  }

  if (trimmed === "~" || trimmed.startsWith("~/") || (process.platform === "win32" && trimmed.startsWith("~\\"))) {
    const withoutTilde = trimmed.substring(1);
    return resolve(getHomeDir(), `.${withoutTilde}`);
  }
  
  return trimmed;
}

/**
 * Returns the active pi-coding-agent directory path.
 */
export function getAgentDir(): string {
  const configured = process.env.PI_CODING_AGENT_DIR;
  if (configured && configured.trim().length > 0) {
    return normalizeAgentDirPath(configured);
  }
  return join(getHomeDir(), ".pi", "agent");
}

/**
 * Returns an absolute path within the pi-coding-agent directory.
 */
export function getAgentPath(...segments: string[]): string {
  return join(getAgentDir(), ...segments);
}

/**
 * Returns an absolute path within the legacy .pi directory.
 */
export function getLegacyPiPath(...segments: string[]): string {
  return join(getHomeDir(), ".pi", ...segments);
}

/**
 * Returns a list of candidate directories for storing sessions.
 */
export function getAgentSessionDirs(): string[] {
  const primary = getAgentPath("sessions");
  const legacy = getLegacyPiPath("sessions");
  
  if (primary !== legacy && existsSync(legacy)) {
    return [primary, legacy];
  }
  return [primary];
}
