import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  expandInlineTriggers,
  findExcludedRanges,
  resetAvailableSkills,
  setAvailableSkillsForTests,
  discoverSkillsFromDirs,
} from "../src/extension/skills/inline-invocation.ts";

function fixtureDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "inline-skills-"));
  writeFileSync(
    join(dir, "review.md"),
    "---\nname: review\n---\nReview skill body.\n",
  );
  writeFileSync(
    join(dir, "ook.md"),
    "---\nname: ook\n---\nOok skill body.\n",
  );
  writeFileSync(
    join(dir, "compact.md"),
    "---\nname: compact\n---\nCompact skill body.\n",
  );
  writeFileSync(
    join(dir, "skills.md"),
    "---\nname: skills\n---\nSkills skill body.\n",
  );
  return dir;
}

describe("inline-invocation", () => {
  let tempDir: string | null = null;

  beforeEach(() => {
    resetAvailableSkills();
    tempDir = fixtureDir();
    setAvailableSkillsForTests(discoverSkillsFromDirs([tempDir]));
  });

  afterEach(() => {
    resetAvailableSkills();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("should not expand unknown triggers", () => {
    const input = "Gebruik /unknown en $nietbestaand";
    const result = expandInlineTriggers(input);
    assert.strictEqual(result, input);
  });

  it("should skip triggers inside code blocks", () => {
    const input = "Code: ``` /review ``` niet expanden";
    const result = expandInlineTriggers(input);
    assert.strictEqual(result, input);
  });

  it("should skip triggers inside inline code", () => {
    const input = "Gebruik niet `$review` maar wel tekst";
    const result = expandInlineTriggers(input);
    assert.strictEqual(result, input);
  });

  it("should handle empty input", () => {
    assert.strictEqual(expandInlineTriggers(""), "");
  });

  it("should expand single /command trigger", () => {
    const input = "Doe /review";
    const result = expandInlineTriggers(input);
    assert.ok(result.includes("Review skill body."));
    assert.ok(!result.includes("/review"));
  });

  it("should expand single $skill trigger", () => {
    const input = "Gebruik $ook";
    const result = expandInlineTriggers(input);
    assert.ok(result.includes("Ook skill body."));
    assert.ok(!result.includes("$ook"));
  });

  it("should handle multiple triggers in one line", () => {
    const input = "Doe /review en $ook samen";
    const result = expandInlineTriggers(input);
    assert.ok(result.includes("Review skill body."));
    assert.ok(result.includes("Ook skill body."));
    assert.ok(!result.includes("/review"));
    assert.ok(!result.includes("$ook"));
  });

  it("should expand triggers in middle of prompt", () => {
    const input = "Laat dit doen /review en daarna verder";
    const result = expandInlineTriggers(input);
    assert.ok(result.includes("Laat dit doen"));
    assert.ok(result.includes("Review skill body."));
    assert.ok(result.includes("en daarna verder"));
  });

  it("should handle multiple same triggers", () => {
    const input = "/review en nog eens /review";
    const result = expandInlineTriggers(input);
    const count = (result.match(/Review skill body\./g) || []).length;
    assert.strictEqual(count, 2);
  });

  it("should preserve text after expansion", () => {
    const input = "Voor /review na";
    const result = expandInlineTriggers(input);
    assert.ok(result.startsWith("Voor"));
    assert.ok(result.endsWith("na"));
  });

  it("should handle trigger at start of string", () => {
    const input = "/review alleen";
    const result = expandInlineTriggers(input);
    assert.ok(result.includes("Review skill body."));
    assert.ok(result.endsWith("alleen"));
  });

  it("should handle trigger at end of string", () => {
    const input = "Alleen /review";
    const result = expandInlineTriggers(input);
    assert.ok(result.startsWith("Alleen"));
    assert.ok(result.includes("Review skill body."));
  });

  it("should skip triggers in nested code blocks", () => {
    const input = "Hier ```\n/review\n``` en hier $ook";
    const result = expandInlineTriggers(input);
    assert.ok(result.includes("/review"));
    assert.ok(result.includes("```"));
    assert.ok(result.includes("Ook skill body."));
  });

  it("should handle mixed valid and invalid triggers", () => {
    const input = "/review en /ongeldig en $ook";
    const result = expandInlineTriggers(input);
    assert.ok(result.includes("Review skill body."));
    assert.ok(result.includes("Ook skill body."));
    assert.ok(result.includes("/ongeldig"));
  });

  it("does not expand triggers inside URLs or paths", () => {
    const input = "see example.com/review and path/to/ook";
    const result = expandInlineTriggers(input);
    assert.strictEqual(result, input);
  });

  it("does not expand reserved slash commands even when skill files exist", () => {
    const input = "run /compact and /skills";
    const result = expandInlineTriggers(input);
    assert.strictEqual(result, input);
    assert.ok(!result.includes("Compact skill body."));
    assert.ok(!result.includes("Skills skill body."));
  });

  it("still expands $review when slash form is reserved elsewhere", () => {
    writeFileSync(
      join(tempDir!, "skills.md"),
      "---\nname: skills\n---\nSkills skill body.\n",
    );
    setAvailableSkillsForTests(discoverSkillsFromDirs([tempDir!]));
    const input = "use $review here";
    const result = expandInlineTriggers(input);
    assert.ok(result.includes("Review skill body."));
    assert.ok(!result.includes("$review"));
  });

  it("does not expand inside an unclosed code fence", () => {
    const input = "before ```\n/review\nafter";
    const result = expandInlineTriggers(input);
    assert.strictEqual(result, input);
    const ranges = findExcludedRanges(input);
    assert.ok(ranges.some(([start]) => start === input.indexOf("```")));
  });

  it("resetAvailableSkills picks up newly written skills on next discover", () => {
    const newPath = join(tempDir!, "fresh.md");
    writeFileSync(newPath, "---\nname: fresh\n---\nFresh skill body.\n");
    resetAvailableSkills();
    setAvailableSkillsForTests(discoverSkillsFromDirs([tempDir!]));
    const result = expandInlineTriggers("try /fresh");
    assert.ok(result.includes("Fresh skill body."));
  });
});
