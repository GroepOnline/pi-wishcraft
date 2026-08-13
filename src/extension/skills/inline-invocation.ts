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
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripFrontmatter } from "../../core/frontmatter.ts";
import { getAgentPath } from "../../paths/agent-dirs.ts";
import { logDiscoveryError } from "../../welcome/discover.ts";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { RuntimeState } from "../core/types.ts";

const EXTENSION_DIR = dirname(fileURLToPath(import.meta.url));

let availableSkills: Map<string, string> | undefined;

function discoverSkills(): void {
  if (availableSkills) return;
  const discovered = new Map<string, string>();
  const dirs = [
    getAgentPath("skills"),
    join(process.cwd(), ".pi", "skills"),
    join(process.cwd(), "skills"),
    getAgentPath("prompts"),
    join(process.cwd(), ".pi", "prompts"),
    join(process.cwd(), "prompts"),
    EXTENSION_DIR,
  ];

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
  availableSkills = discovered;
}

/**
 * Vind alle code block ranges om false positives te voorkomen
 */
function findExcludedRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const fenceRe = /```[\s\S]*?```/g;
  const inlineRe = /`[^`\n]*`/g;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text)))
    ranges.push([m.index, m.index + m[0].length]);
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

  // Pattern voor zowel /command als $skill
  const TRIGGER_REGEX = /(\/|\$)([a-zA-Z0-9_-]+)/g;
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
    // Skip als binnen code block
    if (isExcluded(match.index, excluded)) continue;

    const name = match[2];

    // Alleen bekende skills expanden
    if (!availableSkills!.has(name)) continue;

    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      full: match[0],
      name,
    });
  }

  // Geen matches -> originele tekst teruggeven
  if (matches.length === 0) return text;

  // Sorteer op positie en verwijder overlappingen
  matches.sort((a, b) => a.start - b.start);
  const deduped: typeof matches = [];
  let lastEnd = -1;
  for (const m of matches) {
    if (m.start >= lastEnd) {
      deduped.push(m);
      lastEnd = m.end;
    }
  }

  // Bouw nieuwe tekst op met expansies
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
      // Bij fout, laat originele trigger staan
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
  pi.on("input", async (event: any) => {
    // Alleen interactive input verwerken
    if (event.source !== "interactive") {
      return { action: "continue" };
    }

    const originalText = event.text;
    const expandedText = expandInlineTriggers(originalText);

    // Alleen transformeren als er iets veranderd is
    if (expandedText !== originalText) {
      return {
        action: "transform",
        text: expandedText,
      };
    }

    return { action: "continue" };
  });
}
