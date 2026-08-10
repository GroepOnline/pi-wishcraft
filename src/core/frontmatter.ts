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
