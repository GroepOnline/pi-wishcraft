import { describe, it } from "node:test";
import assert from "node:assert";
import { expandInlineTriggers } from "../src/extension/skills/inline-invocation.ts";

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

	it("should expand single /command trigger", () => {
		const input = "Doe /test";
		const result = expandInlineTriggers(input);
		assert.ok(result.includes("Dit is een test skill content"));
		assert.ok(!result.includes("/test"));
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
		assert.ok(!result.includes("/test"));
		assert.ok(!result.includes("$ook"));
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
		const input = "/test en /ongeldig en $ook";
		const result = expandInlineTriggers(input);
		assert.ok(result.includes("Dit is een test skill content"));
		assert.ok(result.includes("Dit is de content van de ook skill"));
		assert.ok(result.includes("/ongeldig"));
	});
});
