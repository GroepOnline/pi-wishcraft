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
const input = "Code: ``` /skill test ``` niet expanden";
const result = expandInlineTriggers(input);
assert.strictEqual(result, input);
});

it("should skip triggers inside inline code", () => {
const input = "Gebruik niet `$variable` maar wel tekst";
const result = expandInlineTriggers(input);
assert.strictEqual(result, input);
});

it("should handle empty input", () => {
assert.strictEqual(expandInlineTriggers(""), "");
});

it("should handle multiple triggers in one line", () => {
const input = "Doe /test en $ook een test";
// Zonder bestaande skills wordt niets geëxpandeerd
const result = expandInlineTriggers(input);
assert.strictEqual(result, input);
});
});
