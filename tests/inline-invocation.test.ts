import { before, describe, it } from "node:test";
import assert from "node:assert";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expandInlineTriggers } from "../src/extension/skills/inline-invocation.ts";
import { invalidateSkillCache } from "../src/extension/skills/skill-registry.ts";

// Fixtures: tijdelijke agent-dir met twee skills, via dezelfde env-override
// die pi zelf gebruikt (PI_CODING_AGENT_DIR).
before(() => {
  const agentDir = mkdtempSync(join(tmpdir(), "wishcraft-skills-"));
  const skillsDir = join(agentDir, "skills");
  mkdirSync(skillsDir, { recursive: true });
  writeFileSync(
    join(skillsDir, "test.md"),
    "---\nname: test\ntrigger: test\ndescription: Test skill voor inline expansie\n---\nDit is een test skill content\n",
  );
  writeFileSync(
    join(skillsDir, "ook.md"),
    "---\nname: ook\ndescription: Ook een test skill\n---\nDit is de content van de ook skill\n",
  );
  process.env.PI_CODING_AGENT_DIR = agentDir;
  invalidateSkillCache();
});

describe("inline-invocation", () => {
	it("should not expand unknown triggers", () => {
		const input = "Gebruik /unknown en $nietbestaand";
		const result = expandInlineTriggers(input);
		assert.strictEqual(result, input);
	});

	it("should skip triggers inside code blocks", () => {
		const input = "Code: ``` /test ``` niet expanden";
		const result = expandInlineTriggers(input);
		assert.strictEqual(result, input);
	});

	it("should skip triggers inside inline code", () => {
		const input = "Gebruik niet `$test` maar wel tekst";
		const result = expandInlineTriggers(input);
		assert.strictEqual(result, input);
	});

	it("should handle empty input", () => {
		assert.strictEqual(expandInlineTriggers(""), "");
	});

	it("should not expand path-like slashes", () => {
		const input = "Zie src/foo/bar.ts en pad/naar/file";
		assert.strictEqual(expandInlineTriggers(input), input);
	});

	it("should not expand $100 or currency-like triggers", () => {
		const input = "Dat kost $100 en $ook is wel een skill";
		const result = expandInlineTriggers(input);
		assert.ok(result.includes("$100"));
		assert.ok(result.includes("Dit is de content van de ook skill"));
	});

	it("should expand single /command trigger", () => {
		const input = "Doe /test";
		const result = expandInlineTriggers(input);
		assert.ok(result.includes("Dit is een test skill content"));
		assert.ok(!result.includes("/test"));
	});

	it("should NOT expand /command for skills without trigger", () => {
		// 'ook' has no trigger: frontmatter, so /ook should not expand
		const input = "Doe /ook";
		const result = expandInlineTriggers(input);
		assert.strictEqual(result, input);
	});

	it("should expand single $skill trigger", () => {
		const input = "Gebruik $ook";
		const result = expandInlineTriggers(input);
		assert.ok(result.includes("Dit is de content van de ook skill"));
		assert.ok(!result.includes("$ook"));
	});

	it("should handle multiple triggers in one line", () => {
		const input = "Doe /test en $ook samen";
		const result = expandInlineTriggers(input);
		assert.ok(result.includes("Dit is een test skill content"));
		assert.ok(result.includes("Dit is de content van de ook skill"));
	});

	it("should expand triggers in middle of prompt", () => {
		const input = "Laat dit doen /test en daarna verder";
		const result = expandInlineTriggers(input);
		assert.ok(result.includes("Laat dit doen"));
		assert.ok(result.includes("Dit is een test skill content"));
		assert.ok(result.includes("en daarna verder"));
	});

	it("should handle multiple same triggers", () => {
		const input = "/test en nog eens /test";
		const result = expandInlineTriggers(input);
		const count = (result.match(/Dit is een test skill content/g) || []).length;
		assert.strictEqual(count, 2);
	});

	it("should preserve text after expansion", () => {
		const input = "Voor /test na";
		const result = expandInlineTriggers(input);
		assert.ok(result.startsWith("Voor"));
		assert.ok(result.endsWith("na"));
	});

	it("should handle trigger at start of string", () => {
		const input = "/test alleen";
		const result = expandInlineTriggers(input);
		assert.ok(result.includes("Dit is een test skill content"));
		assert.ok(result.endsWith("alleen"));
	});

	it("should handle trigger at end of string", () => {
		const input = "Alleen /test";
		const result = expandInlineTriggers(input);
		assert.ok(result.startsWith("Alleen"));
		assert.ok(result.includes("Dit is een test skill content"));
	});

	it("should skip triggers in nested code blocks", () => {
		const input = "Hier ```\n/test\n``` en hier $ook";
		const result = expandInlineTriggers(input);
		// /test binnen code block moet niet geëxpandeerd worden (blijft staan)
		assert.ok(result.includes("/test"));
		// Code block moet behouden blijven
		assert.ok(result.includes("```"));
		// $ook buiten code block moet wel geëxpandeerd worden
		assert.ok(result.includes("Dit is de content van de ook skill"));
	});

	it("should handle mixed valid and invalid triggers", () => {
		const input = "/test en /ongeldig en $ook en /ook";
		const result = expandInlineTriggers(input);
		// /test expands (has trigger: test)
		assert.ok(result.includes("Dit is een test skill content"));
		// $ook expands (has name: ook)
		assert.ok(result.includes("Dit is de content van de ook skill"));
		// /ongeldig unknown, stays
		assert.ok(result.includes("/ongeldig"));
		// /ook does NOT expand (no trigger in frontmatter)
		// The literal "/ook" should remain in the output
		assert.ok(result.includes("/ook"));
	});
});
