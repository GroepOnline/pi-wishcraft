/**
 * inline-invocation.ts
 * ------------------------------------------------------------------------
 * Pi.dev extension — pi-wishcraft
 *
 * Doel:
 *   1. `/skill:naam` moet ook MIDDEN in een prompt werken, niet alleen als
 *      eerste token van het bericht.
 *   2. Meerdere `/skill:naam` invocaties per bericht moeten werken (niet
 *      maar 1).
 *   3. Skills moeten ook zonder `/`-prefix aanroepbaar zijn, via `$naam`.
 *   4. Generieke `/[command]` moet ook midden in de prompt werken.
 *   5. Meerdere commando's per bericht moeten ondersteund worden.
 *
 * Aanpak: 100% native via de publieke extension-API van pi.dev
 * (`pi.on("input", ...)`), zonder core (agent-session.ts) te patchen.
 * ------------------------------------------------------------------------
 */

import { readFileSync } from "node:fs";
import { stripFrontmatter } from "../core/frontmatter";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { RuntimeState } from "./types.ts";

type InputEvent = {
	text: string;
	images?: unknown[];
	source: "interactive" | "rpc" | "extension";
	streamingBehavior?: "steer" | "followUp";
};

type InputResult =
	| { action: "continue" }
	| { action: "transform"; text: string; images?: unknown[] }
	| { action: "handled" };

type SkillRef = {
	name: string;
	filePath: string;
	baseDir: string;
};

type InlineCommandHandler = (args: string, context: any) => Promise<string>;

type InlineCommand = {
	name: string;
	description: string;
	handler: InlineCommandHandler;
};

// ---------------------------------------------------------------------------
// 1. Caches
// ---------------------------------------------------------------------------
let skillCache = new Map<string, SkillRef>();
let commandCache = new Map<string, InlineCommand>();

export function refreshSkillCache(skills: SkillRef[]): void {
	skillCache = new Map(skills.map((s) => [s.name, s]));
}

export function registerInlineCommand(
	name: string,
	description: string,
	handler: InlineCommandHandler,
): void {
	commandCache.set(name, { name, description, handler });
}

export function getInlineCommands(): Map<string, InlineCommand> {
	return commandCache;
}

// ---------------------------------------------------------------------------
// 2. Skill-blok bouwen
// ---------------------------------------------------------------------------

function buildSkillBlock(skill: SkillRef): string {
	const content = readFileSync(skill.filePath, "utf-8");
	const body = stripFrontmatter(content).trim();
	return `<skill name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${skill.baseDir}.\n\n${body}\n</skill>`;
}

// ---------------------------------------------------------------------------
// 3. Code-spans overslaan
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 4. Matching + expansie voor skills
// ---------------------------------------------------------------------------

const SKILL_COLON_RE = /\/skill:([\w-]+)/g;
const DOLLAR_RE = /\$([A-Za-z][\w-]*)/g;

type SkillMatch = { start: number; end: number; skill: SkillRef };

function collectSkillMatches(text: string): SkillMatch[] {
	const excluded = findExcludedRanges(text);
	const matches: SkillMatch[] = [];

	for (const re of [SKILL_COLON_RE, DOLLAR_RE]) {
		re.lastIndex = 0;
		let m: RegExpExecArray | null;
		while ((m = re.exec(text))) {
			if (isExcluded(m.index, excluded)) continue;
			const skill = skillCache.get(m[1]);
			if (!skill) continue;
			matches.push({ start: m.index, end: m.index + m[0].length, skill });
		}
	}

	matches.sort((a, b) => a.start - b.start);
	const deduped: SkillMatch[] = [];
	let lastEnd = -1;
	for (const match of matches) {
		if (match.start >= lastEnd) {
			deduped.push(match);
			lastEnd = match.end;
		}
	}
	return deduped;
}

function expandAllSkills(text: string, matches: SkillMatch[]): string {
	let result = "";
	let cursor = 0;
	for (const { start, end, skill } of matches) {
		result += text.slice(cursor, start);
		result += buildSkillBlock(skill);
		cursor = end;
	}
	result += text.slice(cursor);
	return result;
}

// ---------------------------------------------------------------------------
// 5. Matching + verwerking voor inline commando's
// ---------------------------------------------------------------------------

const COMMAND_RE = /\/([a-zA-Z][\w-]*)(?:\s+([^\s\/]+))?/g;

type CommandMatch = {
	start: number;
	end: number;
	name: string;
	args: string;
	fullMatch: string;
};

function collectCommandMatches(text: string): CommandMatch[] {
	const excluded = findExcludedRanges(text);
	const matches: CommandMatch[] = [];

	COMMAND_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = COMMAND_RE.exec(text))) {
		if (isExcluded(m.index, excluded)) continue;
		
		// Skip skill: commands (die worden apart verwerkt)
		if (m[1] === "skill") continue;
		
		const command = commandCache.get(m[1]);
		if (!command) continue;
		
		matches.push({
			start: m.index,
			end: m.index + m[0].length,
			name: m[1],
			args: m[2] || "",
			fullMatch: m[0],
		});
	}

	matches.sort((a, b) => a.start - b.start);
	const deduped: CommandMatch[] = [];
	let lastEnd = -1;
	for (const match of matches) {
		if (match.start >= lastEnd) {
			deduped.push(match);
			lastEnd = match.end;
		}
	}
	return deduped;
}

async function processInlineCommands(
	text: string,
	matches: CommandMatch[],
	context: any,
): Promise<string> {
	let result = "";
	let cursor = 0;
	
	for (const { start, end, name, args } of matches) {
		result += text.slice(cursor, start);
		
		const command = commandCache.get(name);
		if (command) {
			try {
				const replacement = await command.handler(args, context);
				result += replacement;
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error);
				result += `[Error executing /${name}: ${errorMsg}]`;
			}
		}
		
		cursor = end;
	}
	
	result += text.slice(cursor);
	return result;
}

// ---------------------------------------------------------------------------
// 6. Extension registratie
// ---------------------------------------------------------------------------

export function setupInlineInvocation(pi: ExtensionAPI, rt: RuntimeState): void {
	// Vul de cache zo vroeg mogelijk
	pi.on("resources_discover", async (event: any) => {
		if (event?.skills) refreshSkillCache(event.skills);
	});

	// Ververs elke beurt
	pi.on("before_agent_start", async (event: any) => {
		if (event?.systemPromptOptions?.skills) {
			refreshSkillCache(event.systemPromptOptions.skills);
		}
		return {};
	});

	pi.on("input", async (event: InputEvent): Promise<InputResult> => {
		// Injecties van de extensie zelf niet opnieuw verwerken
		if (event.source === "extension") return { action: "continue" };

		// Verzamel alle skill matches
		const skillMatches = collectSkillMatches(event.text);
		
		// Verzamel alle command matches
		const commandMatches = collectCommandMatches(event.text);

		if (skillMatches.length === 0 && commandMatches.length === 0) {
			return { action: "continue" };
		}

		// Backwards compatibility: als het bericht in zijn geheel bestaat uit
		// precies één `/skill:naam` op positie 0, laten we 'm ongemoeid
		const isLegacySingleHeadCase =
			skillMatches.length === 1 &&
			commandMatches.length === 0 &&
			skillMatches[0].start === 0 &&
			event.text.startsWith("/skill:");
		if (isLegacySingleHeadCase) return { action: "continue" };

		// Eerst skills expanden
		let transformed = event.text;
		if (skillMatches.length > 0) {
			transformed = expandAllSkills(transformed, skillMatches);
		}

		// Dan inline commando's verwerken
		if (commandMatches.length > 0) {
			const ctx = rt.currentCtx;
			transformed = await processInlineCommands(transformed, commandMatches, ctx);
		}

		return { action: "transform", text: transformed };
	});
}

/**
 * ---------------------------------------------------------------------
 * Gebruiksvoorbeelden:
 * ---------------------------------------------------------------------
 * 
 * // Registreer een inline commando in je extension:
 * import { registerInlineCommand } from "./inline-invocation.ts";
 * 
 * registerInlineCommand(
 *   "compact",
 *   "Compact the current queue item",
 *   async (args, ctx) => {
 *     // Voer compactie logica uit
 *     return "[Queue compacted]";
 *   }
 * );
 * 
 * // Gebruik in prompts:
 * - "Laat dit doen /compact en daarna /idea test"
 * - "Gebruik $mySkill hier en $anotherSkill daar"
 * - "/cmd1 arg1 tekst /cmd2 arg2 meer tekst"
 * 
 * ---------------------------------------------------------------------
 */
