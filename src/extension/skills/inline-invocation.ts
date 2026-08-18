/**
 * inline-invocation.ts
 * ------------------------------------------------------------------------
 * Inline trigger expansie zoals Cursor (met /) en Codex (met $).
 *
 *   /command -> vervangt door inhoud van command.md skill file
 *   $skill   -> vervangt door inhoud van skill.md skill file
 *
 * Discovery en cache leven in skill-registry.ts (pi core loadSkills + TTL),
 * zodat nieuwe skills zonder herstart werken en usage bijgehouden wordt.
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
  const fenceRe = /```[\s\S]*?```/g;
  const inlineRe = /`[^`\n]*`/g;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text)))
    ranges.push([m.index, m.index + m[0].length]);
  while ((m = inlineRe.exec(text)))
    ranges.push([m.index, m.index + m[0].length]);
  // open fence die nooit sluit: de rest van de tekst telt als code
  const openFence = text.split("```").length - 1;
  if (openFence % 2 === 1) {
    const last = text.lastIndexOf("```");
    if (last >= 0) ranges.push([last, text.length]);
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

  // Pattern voor zowel /command als $skill
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

  // Cache verversen bij herstart/reload zodat nieuwe skills meteen zichtbaar zijn
  pi.on("session_start", () => {
    invalidateSkillCache();
  });
}
