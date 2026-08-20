/**
 * inline-invocation.ts
 * ------------------------------------------------------------------------
 * Inline trigger expansion like Cursor (`/`) and Codex (`$`).
 *
 *   /command -> replaced with the command.md skill body
 *   $skill   -> replaced with the skill.md skill body
 *
 * Discovery and cache live in skill-registry.ts (pi core loadSkills + TTL)
 * so new skills work without a restart and usage is tracked.
 * ------------------------------------------------------------------------
 */

import { readFileSync } from "node:fs";
import { stripFrontmatter } from "../../core/frontmatter.ts";
import { logDiscoveryError } from "../../welcome/discover.ts";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { RuntimeState } from "../core/types.ts";
import {
  getAvailableSkills,
  invalidateSkillCache,
  recordSkillUsage,
} from "./skill-registry.ts";

/**
 * Vind alle code block ranges om false positives te voorkomen
 */
function findExcludedRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];

  // Pair ``` fences left-to-right: elke openende fence sluit op de eerstvolgende
  // ```; een openende fence zonder sluiter dekt de rest tot EOF. Zo telt geen
  // fence dubbel en klopt de parity ook bij een oneven aantal markers.
  const fenceIndexes: number[] = [];
  for (let i = text.indexOf("```"); i !== -1; i = text.indexOf("```", i + 3)) {
    fenceIndexes.push(i);
  }
  for (let f = 0; f < fenceIndexes.length; f += 2) {
    const start = fenceIndexes[f]!;
    const closer = fenceIndexes[f + 1];
    const end = closer === undefined ? text.length : closer + 3;
    ranges.push([start, end]);
  }

  // Inline `code` alleen buiten de fenced ranges tellen.
  const inlineRe = /`[^`\n]*`/g;
  let m: RegExpExecArray | null;
  while ((m = inlineRe.exec(text))) {
    const start = m.index;
    if (!ranges.some(([s, e]) => start >= s && start < e)) {
      ranges.push([start, start + m[0].length]);
    }
  }
  return ranges;
}

function isExcluded(index: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([start, end]) => index >= start && index < end);
}

/**
 * Expandeer alle inline triggers (/command en $skill) in de tekst
 */
export function expandInlineTriggers(text: string): string {
  const availableSkills = getAvailableSkills();

  // Pattern for both /command and $skill
  const TRIGGER_REGEX = /(^|[\s(])(\/|\$)([a-zA-Z0-9_-]+)/g;
  const excluded = findExcludedRanges(text);

  const matches: Array<{
    start: number;
    end: number;
    full: string;
    name: string;
  }> = [];
  let match: RegExpExecArray | null;

  while ((match = TRIGGER_REGEX.exec(text)) !== null) {
    // Skip als binnen code block
    if (isExcluded(match.index, excluded)) continue;

    const name = match[3]!;

    // Alleen bekende skills expanden
    if (!availableSkills.has(name)) continue;

    matches.push({
      start: match.index + match[1]!.length,
      end: match.index + match[0].length,
      full: match[0],
      name,
    });
  }

  // Geen matches -> originele tekst teruggeven
  if (matches.length === 0) return text;

  // Sort by position and drop overlaps
  matches.sort((a, b) => a.start - b.start);
  const deduped: typeof matches = [];
  let lastEnd = -1;
  for (const m of matches) {
    if (m.start >= lastEnd) {
      deduped.push(m);
      lastEnd = m.end;
    }
  }

  // Rebuild the text with expansions
  let result = "";
  let cursor = 0;

  for (const m of deduped) {
    result += text.slice(cursor, m.start);

    const filePath = availableSkills.get(m.name)!;
    try {
      const rawContent = readFileSync(filePath, "utf8");
      const cleanContent = stripFrontmatter(rawContent);
      result += `\n\n${cleanContent}\n\n`;
      recordSkillUsage(m.name);
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

  // Refresh the cache on restart/reload so new skills show up immediately
  pi.on("session_start", () => {
    invalidateSkillCache();
  });
}
