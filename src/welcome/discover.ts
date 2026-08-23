import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { getAgentPath, getHomeDir } from "../paths/agent-dirs.ts";
import type { LoadedCounts } from "./types.ts";

const loggedDiscoveryErrors = new Set<string>();

export function logDiscoveryError(scope: string, error: unknown): void {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  ) {
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  const key = `${scope}:${message}`;
  if (loggedDiscoveryErrors.has(key)) {
    return;
  }

  loggedDiscoveryErrors.add(key);
  if (loggedDiscoveryErrors.size > 500) {
    loggedDiscoveryErrors.clear();
  }

  console.debug(`[powerline-welcome] ${scope}:`, error);
}

function scanContextFiles(homeDir: string, cwd: string): number {
  let count = 0;
  const agentsMdPaths = [
    getAgentPath("AGENTS.md"),
    join(homeDir, ".claude", "AGENTS.md"),
    join(cwd, "AGENTS.md"),
    join(cwd, ".pi", "AGENTS.md"),
    join(cwd, ".claude", "AGENTS.md"),
  ];

  for (const path of agentsMdPaths) {
    if (existsSync(path)) count++;
  }
  return count;
}

function scanExtensions(cwd: string): number {
  let count = 0;
  const countedExtensions = new Set<string>();
  const settingsPaths = [
    getAgentPath("settings.json"),
    join(cwd, ".pi", "settings.json"),
  ];

  for (const settingsPath of settingsPaths) {
    if (!existsSync(settingsPath)) continue;

    try {
      const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
      let packages: unknown = null;
      if (typeof settings === "object" && settings !== null && !Array.isArray(settings)) {
        packages = "packages" in settings ? (settings as { packages: unknown }).packages : null;
      }

      if (Array.isArray(packages)) {
        for (const pkg of packages) {
          let source: unknown = null;
          let extensionsFilter: unknown = null;

          if (typeof pkg === "string") {
            source = pkg;
          } else if (typeof pkg === "object" && pkg !== null && !Array.isArray(pkg)) {
            source = "source" in pkg ? (pkg as { source: unknown }).source : null;
            extensionsFilter = "extensions" in pkg ? (pkg as { extensions: unknown }).extensions : null;
          }

          if (typeof source !== "string") continue;
          
          const normalizedSource = source.trim();
          if (!normalizedSource.startsWith("npm:")) continue;
          if (Array.isArray(extensionsFilter) && extensionsFilter.length === 0) continue;

          const body = normalizedSource.slice(4);
          const versionIndex = body.lastIndexOf("@");
          const name = versionIndex > 0 ? body.slice(0, versionIndex) : body;
          
          if (!name || countedExtensions.has(name)) continue;

          countedExtensions.add(name);
          count++;
        }
      }
    } catch (error) {
      logDiscoveryError(`Failed to read settings at ${settingsPath}`, error);
    }
  }

  const extensionDirs = [
    getAgentPath("extensions"),
    join(cwd, "extensions"),
    join(cwd, ".pi", "extensions"),
  ];

  for (const dir of extensionDirs) {
    if (!existsSync(dir)) continue;
    
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const entryPath = join(dir, entry);
        try {
          const stats = statSync(entryPath);
          if (stats.isDirectory()) {
            if (
              existsSync(join(entryPath, "index.ts")) ||
              existsSync(join(entryPath, "index.js")) ||
              existsSync(join(entryPath, "package.json"))
            ) {
              if (!countedExtensions.has(entry)) {
                countedExtensions.add(entry);
                count++;
              }
            }
          } else if ((entry.endsWith(".ts") || entry.endsWith(".js")) && !entry.startsWith(".")) {
            const ext = entry.endsWith(".ts") ? ".ts" : ".js";
            const name = basename(entry, ext);
            if (!countedExtensions.has(name)) {
              countedExtensions.add(name);
              count++;
            }
          }
        } catch (error) {
          logDiscoveryError(`Failed to inspect extension entry ${entryPath}`, error);
        }
      }
    } catch (error) {
      logDiscoveryError(`Failed to scan extensions dir ${dir}`, error);
    }
  }

  return count;
}

function scanSkills(cwd: string): number {
  let count = 0;
  const countedSkills = new Set<string>();
  const skillDirs = [
    getAgentPath("skills"),
    join(cwd, ".pi", "skills"),
    join(cwd, "skills"),
  ];

  for (const dir of skillDirs) {
    if (!existsSync(dir)) continue;
    
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const entryPath = join(dir, entry);
        try {
          if (statSync(entryPath).isDirectory() && existsSync(join(entryPath, "SKILL.md"))) {
            if (!countedSkills.has(entry)) {
              countedSkills.add(entry);
              count++;
            }
          }
        } catch (error) {
          logDiscoveryError(`Failed to inspect skill entry ${entryPath}`, error);
        }
      }
    } catch (error) {
      logDiscoveryError(`Failed to scan skills dir ${dir}`, error);
    }
  }

  return count;
}

function scanPromptTemplates(homeDir: string, cwd: string): number {
  const countedTemplates = new Set<string>();
  let count = 0;

  function countTemplatesInDir(dir: string) {
    if (!existsSync(dir)) return;
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const entryPath = join(dir, entry);
        try {
          const stats = statSync(entryPath);
          if (stats.isDirectory()) {
            countTemplatesInDir(entryPath);
          } else if (entry.endsWith(".md")) {
            const name = basename(entry, ".md");
            if (!countedTemplates.has(name)) {
              countedTemplates.add(name);
              count++;
            }
          }
        } catch (error) {
          logDiscoveryError(`Failed to inspect prompt template entry ${entryPath}`, error);
        }
      }
    } catch (error) {
      logDiscoveryError(`Failed to scan prompt template dir ${dir}`, error);
    }
  }

  const templateDirs = [
    getAgentPath("commands"),
    join(homeDir, ".claude", "commands"),
    join(cwd, ".pi", "commands"),
    join(cwd, ".claude", "commands"),
  ];

  for (const dir of templateDirs) {
    countTemplatesInDir(dir);
  }

  return count;
}

export function discoverLoadedCounts(): LoadedCounts {
  const homeDir = getHomeDir();
  const cwd = process.cwd();

  const contextFiles = scanContextFiles(homeDir, cwd);
  const extensions = scanExtensions(cwd);
  const skills = scanSkills(cwd);
  const promptTemplates = scanPromptTemplates(homeDir, cwd);

  return { contextFiles, extensions, skills, promptTemplates };
}
