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

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripFrontmatter } from "../../core/frontmatter.ts";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { RuntimeState } from "../types.ts";

const SKILLS_DIR = dirname(fileURLToPath(import.meta.url));

let availableSkills = new Map<string, string>();

function discoverSkills(): void {
availableSkills.clear();
if (!existsSync(SKILLS_DIR)) return;

try {
const files = readdirSync(SKILLS_DIR);
for (const file of files) {
if (file.endsWith(".md") || file.endsWith(".txt")) {
const name = file.replace(/\.(md|txt)$/, "");
availableSkills.set(name, join(SKILLS_DIR, file));
}
}
} catch (err) {
// Silent fail if skills dir doesn't exist yet
}
}

/**
 * Vind alle code block ranges om false positives te voorkomen
 */
function findExcludedRanges(text: string): Array<[number, number]> {
const ranges: Array<[number, number]> = [];
const fenceRe = /```[\s\S]*?```/g;
const inlineRe = /`[^`\n]*`/g;
let m: RegExpExecArray | null;
while ((m = fenceRe.exec(text))) ranges.push([m.index, m.index + m[0].length]);
while ((m = inlineRe.exec(text))) ranges.push([m.index, m.index + m[0].length]);
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

const matches: Array<{ start: number; end: number; full: string; name: string }> = [];
let match: RegExpExecArray | null;

TRIGGER_REGEX.lastIndex = 0;
while ((match = TRIGGER_REGEX.exec(text)) !== null) {
// Skip als binnen code block
if (isExcluded(match.index, excluded)) continue;

const name = match[2];

// Alleen bekende skills expanden
if (!availableSkills.has(name)) continue;

matches.push({
start: match.index,
end: match.index + match[0].length,
full: match[0],
name
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
const rawContent = readFileSync(filePath, "utf-8");
const cleanContent = stripFrontmatter(rawContent).trim();
result += `\n\n${cleanContent}\n\n`;
} catch (err) {
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
export function setupInlineInvocation(pi: ExtensionAPI, rt: RuntimeState): void {
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
text: expandedText 
};
}

return { action: "continue" };
});
}
