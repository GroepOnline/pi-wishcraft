/**
 * inline-invocation.ts
 * ------------------------------------------------------------------------
 * Pi.dev extension — pi-wishcraft
 *
 * Simpele inline trigger expansie zoals Cursor (met /) en Codex (met $)
 *
 * Gebruik:
 *   - /command -> vervangt door inhoud van command.md skill file
 *   - $skill   -> vervangt door inhoud van skill.md skill file
 *
 * Werkt midden in prompts, ondersteunt meerdere triggers per bericht.
 * ------------------------------------------------------------------------
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { stripFrontmatter } from "../../core/frontmatter.ts";
import { getAgentPath } from "../../paths/agent-dirs.ts";
import { logDiscoveryError } from "../../welcome/discover.ts";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { RuntimeState } from "../core/types.ts";

const STATIC_RESERVED_SLASH_COMMANDS = [
  "powerline",
  "skills",
  "vibe",
  "bash-mode",
  "bash-reset",
  "stash-history",
  "tps",
  "open-ports",
  "idea",
  "ideas",
  "queue",
  "compact",
  "model",
  "editor",
  "clear",
  "cd",
  "resume",
  "copy",
  "undo",
  "redo",
  "new",
  "session",
  "settings",
  "help",
  "export",
  "share",
  "tree",
  "fork",
  "branch",
  "thinking",
  "fast",
  "verbose",
] as const;

let availableSkills: Map<string, string> | undefined;
let reservedSlashCommands = new Set<string>(STATIC_RESERVED_SLASH_COMMANDS);

/** Reset the skill discovery cache (session start/shutdown and tests). */
export function resetAvailableSkills(): void {
  availableSkills = undefined;
}

/** Inject a skill map for tests without scanning disk. */
export function setAvailableSkillsForTests(map: Map<string, string>): void {
  availableSkills = map;
}

/** Scan the given directories and return name → file path. */
export function discoverSkillsFromDirs(dirs: string[]): Map<string, string> {
  const discovered = new Map<string, string>();

  for (const dir of dirs) {
    try {
      if (!existsSync(dir)) continue;
      for (const entry of readdirSync(dir)) {
        const entryPath = join(dir, entry);
        try {
          if (
            statSync(entryPath).isDirectory() &&
            existsSync(join(entryPath, "SKILL.md"))
          ) {
            discovered.set(entry, join(entryPath, "SKILL.md"));
          } else if (entry.endsWith(".md") || entry.endsWith(".txt")) {
            discovered.set(entry.replace(/\.(md|txt)$/, ""), entryPath);
          }
        } catch (error) {
          logDiscoveryError(
            `Failed to inspect inline skill entry ${entryPath}`,
            error,
          );
        }
      }
    } catch (error) {
      logDiscoveryError(`Failed to scan inline skills dir ${dir}`, error);
    }
  }

  return discovered;
}

function discoverSkills(): void {
  if (availableSkills) return;
  const dirs = [
    getAgentPath("skills"),
    join(process.cwd(), ".pi", "skills"),
    join(process.cwd(), "skills"),
    getAgentPath("prompts"),
    join(process.cwd(), ".pi", "prompts"),
    join(process.cwd(), "prompts"),
  ];
  availableSkills = discoverSkillsFromDirs(dirs);
}

/** Publieke toegang tot de ontdekte skills (naam → bestandspad). */
export function getAvailableSkills(): Map<string, string> {
  discoverSkills();
  return availableSkills!;
}

/**
 * Vind alle code block ranges om false positives te voorkomen
 */
export function findExcludedRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];

  let pos = 0;
  while (pos < text.length) {
    const fenceStart = text.indexOf("```", pos);
    if (fenceStart === -1) break;
    const fenceEnd = text.indexOf("```", fenceStart + 3);
    if (fenceEnd === -1) {
      ranges.push([fenceStart, text.length]);
      break;
    }
    ranges.push([fenceStart, fenceEnd + 3]);
    pos = fenceEnd + 3;
  }

  const inlineRe = /`[^`\n]*`/g;
  let m: RegExpExecArray | null;
  while ((m = inlineRe.exec(text)))
    ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}

function isExcluded(index: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([start, end]) => index >= start && index < end);
}

/**
 * Expandeer alle inline triggers (/command en $skill) in de tekst
 */
export function expandInlineTriggers(text: string): string {
  discoverSkills();

  // Left boundary: start-of-string or whitespace — avoids paths/URLs like example.com/test
  const TRIGGER_REGEX = /(?:^|[\s])((\/|\$)([a-zA-Z0-9_-]+))/g;
  const excluded = findExcludedRanges(text);

  const matches: Array<{
    start: number;
    end: number;
    full: string;
    name: string;
  }> = [];
  let match: RegExpExecArray | null;

  TRIGGER_REGEX.lastIndex = 0;
  while ((match = TRIGGER_REGEX.exec(text)) !== null) {
    const fullTrigger = match[1];
    const triggerChar = match[2];
    const name = match[3];
    const start = match.index + match[0].length - fullTrigger.length;
    const end = start + fullTrigger.length;

    if (isExcluded(start, excluded)) continue;

    if (triggerChar === "/" && reservedSlashCommands.has(name)) continue;

    if (!availableSkills!.has(name)) continue;

    matches.push({
      start,
      end,
      full: fullTrigger,
      name,
    });
  }

  if (matches.length === 0) return text;

  matches.sort((a, b) => a.start - b.start);
  const deduped: typeof matches = [];
  let lastEnd = -1;
  for (const m of matches) {
    if (m.start >= lastEnd) {
      deduped.push(m);
      lastEnd = m.end;
    }
  }

  let result = "";
  let cursor = 0;

  for (const m of deduped) {
    result += text.slice(cursor, m.start);

    const filePath = availableSkills!.get(m.name)!;
    try {
      const rawContent = readFileSync(filePath, "utf-8");
      const cleanContent = stripFrontmatter(rawContent);
      result += `\n\n${cleanContent}\n\n`;
    } catch (error) {
      logDiscoveryError(`Failed to read inline skill ${filePath}`, error);
      result += m.full;
    }

    cursor = m.end;
  }

  result += text.slice(cursor);
  return result;
}

/**
 * Setup de inline invocation hook
 */
export function setupInlineInvocation(
  pi: ExtensionAPI,
  rt: RuntimeState,
): void {
  reservedSlashCommands = new Set(STATIC_RESERVED_SLASH_COMMANDS);
  const commands = pi.getCommands?.();
  if (commands) {
    for (const cmd of commands) {
      reservedSlashCommands.add(cmd.name);
    }
  }

  pi.on("input", async (event: any) => {
    if (event.source !== "interactive") {
      return { action: "continue" };
    }

    const originalText = event.text;
    const expandedText = expandInlineTriggers(originalText);

    if (expandedText !== originalText) {
      return {
        action: "transform",
        text: expandedText,
      };
    }

    return { action: "continue" };
  });
}
