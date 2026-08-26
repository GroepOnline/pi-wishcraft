/**
 * frontmatter.ts
 * ------------------------------------------------------------------------
 * Utility for stripping YAML frontmatter from markdown/text files.
 * Used by skills system to extract the actual content from skill files.
 * ------------------------------------------------------------------------
 */

/**
 * Strips YAML frontmatter from a text file.
 * Frontmatter is delimited by --- at the start and end.
 * 
 * @param content - The full file content including potential frontmatter
 * @returns The content with frontmatter removed
 */
export function stripFrontmatter(content: string): string {
	const lines = content.split("\n");
	
	// Check if file starts with frontmatter delimiter
	if (lines[0]?.trim() !== "---") {
		return content;
	}
	
	// Find the closing delimiter
	let endIndex = -1;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i]?.trim() === "---") {
			endIndex = i;
			break;
		}
	}
	
	// If no closing delimiter found, return original content
	if (endIndex === -1) {
		return content;
	}
	
	// Return everything after the frontmatter without changing user-authored whitespace
	return lines.slice(endIndex + 1).join("\n");
}

export interface SkillFrontmatter {
	name: string | null;
	description: string | null;
	trigger: string | null;
}

/**
 * Parse minimal YAML frontmatter (name/description/trigger) from a skill file.
 * Returns nulls when the keys are absent or there is no frontmatter block.
 */
export function parseSkillFrontmatter(content: string): SkillFrontmatter {
	const fm: SkillFrontmatter = { name: null, description: null, trigger: null };
	const lines = content.split("\n");

	if (lines[0]?.trim() !== "---") {
		return fm;
	}

	let end = -1;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i]?.trim() === "---") {
			end = i;
			break;
		}
	}
	if (end === -1) {
		return fm;
	}

	for (const line of lines.slice(1, end)) {
		const match = /^\s*([a-zA-Z0-9_-]+)\s*:\s*(.*)$/.exec(line);
		if (!match) continue;
		const key = match[1]!.toLowerCase();
		const value = match[2]!.trim().replace(/^["']|["']$/g, "");
		if (key === "name" && fm.name === null) {
			fm.name = value || null;
		} else if (key === "description" && fm.description === null) {
			fm.description = value || null;
		} else if (key === "trigger" && fm.trigger === null) {
			fm.trigger = value ? value.replace(/^\//, "") : null;
		}
	}

	return fm;
}
