import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  expandInlineTriggers,
  findExcludedRanges,
  resetAvailableSkills,
  setAvailableSkillsForTests,
  setReservedSlashCommandsForTests,
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

function withFixtures(run: (dir: string) => void): void {
  resetAvailableSkills();
  setReservedSlashCommandsForTests([]);
  const dir = fixtureDir();
  setAvailableSkillsForTests(discoverSkillsFromDirs([dir]));
  try {
    run(dir);
  } finally {
    resetAvailableSkills();
    setReservedSlashCommandsForTests([]);
    rmSync(dir, { recursive: true, force: true });
  }
}

test("does not expand unknown triggers", () => {
  withFixtures(() => {
    const input = "Gebruik /unknown en $nietbestaand";
    assert.equal(expandInlineTriggers(input), input);
  });
});

test("skips triggers inside code blocks", () => {
  withFixtures(() => {
    const input = "Code: ``` /review ``` niet expanden";
    assert.equal(expandInlineTriggers(input), input);
  });
});

test("skips triggers inside inline code", () => {
  withFixtures(() => {
    const input = "Gebruik niet `$review` maar wel tekst";
    assert.equal(expandInlineTriggers(input), input);
  });
});

test("handles empty input", () => {
  withFixtures(() => {
    assert.equal(expandInlineTriggers(""), "");
  });
});

test("expands a single /command trigger", () => {
  withFixtures(() => {
    const result = expandInlineTriggers("Doe /review");
    assert.match(result, /Review skill body\./);
    assert.equal(result.includes("/review"), false);
  });
});

test("expands a single $skill trigger", () => {
  withFixtures(() => {
    const result = expandInlineTriggers("Gebruik $ook");
    assert.match(result, /Ook skill body\./);
    assert.equal(result.includes("$ook"), false);
  });
});

test("handles multiple triggers in one line", () => {
  withFixtures(() => {
    const result = expandInlineTriggers("Doe /review en $ook samen");
    assert.match(result, /Review skill body\./);
    assert.match(result, /Ook skill body\./);
    assert.equal(result.includes("/review"), false);
    assert.equal(result.includes("$ook"), false);
  });
});

test("expands triggers in the middle of a prompt", () => {
  withFixtures(() => {
    const result = expandInlineTriggers("Laat dit doen /review en daarna verder");
    assert.match(result, /Laat dit doen/);
    assert.match(result, /Review skill body\./);
    assert.match(result, /en daarna verder/);
  });
});

test("handles multiple same triggers", () => {
  withFixtures(() => {
    const result = expandInlineTriggers("/review en nog eens /review");
    const count = (result.match(/Review skill body\./g) || []).length;
    assert.equal(count, 2);
  });
});

test("preserves text after expansion", () => {
  withFixtures(() => {
    const result = expandInlineTriggers("Voor /review na");
    assert.equal(result.startsWith("Voor"), true);
    assert.equal(result.endsWith("na"), true);
  });
});

test("handles a trigger at the start of the string", () => {
  withFixtures(() => {
    const result = expandInlineTriggers("/review alleen");
    assert.match(result, /Review skill body\./);
    assert.equal(result.endsWith("alleen"), true);
  });
});

test("handles a trigger at the end of the string", () => {
  withFixtures(() => {
    const result = expandInlineTriggers("Alleen /review");
    assert.equal(result.startsWith("Alleen"), true);
    assert.match(result, /Review skill body\./);
  });
});

test("skips triggers in nested code blocks", () => {
  withFixtures(() => {
    const result = expandInlineTriggers("Hier ```\n/review\n``` en hier $ook");
    assert.match(result, /\/review/);
    assert.match(result, /```/);
    assert.match(result, /Ook skill body\./);
  });
});

test("handles mixed valid and invalid triggers", () => {
  withFixtures(() => {
    const result = expandInlineTriggers("/review en /ongeldig en $ook");
    assert.match(result, /Review skill body\./);
    assert.match(result, /Ook skill body\./);
    assert.match(result, /\/ongeldig/);
  });
});

test("does not expand triggers inside URLs or paths", () => {
  withFixtures(() => {
    const input = "see example.com/review and path/to/ook and /review/file";
    assert.equal(expandInlineTriggers(input), input);
  });
});

test("does not expand a slash trigger that continues as a file path", () => {
  withFixtures(() => {
    const file = "open /review.md please";
    const nested = "open /review/notes";
    const absNested = "/review/file";
    const spacedAbs = "open /review/file";
    assert.equal(expandInlineTriggers(file), file);
    assert.equal(expandInlineTriggers(nested), nested);
    assert.equal(expandInlineTriggers(absNested), absNested);
    assert.equal(expandInlineTriggers(spacedAbs), spacedAbs);
  });
});

test("does not expand reserved slash commands even when skill files exist", () => {
  withFixtures(() => {
    const input = "run /compact and /skills";
    const result = expandInlineTriggers(input);
    assert.equal(result, input);
    assert.equal(result.includes("Compact skill body."), false);
    assert.equal(result.includes("Skills skill body."), false);
  });
});

test("still expands $review when /review is a reserved slash command", () => {
  withFixtures(() => {
    setReservedSlashCommandsForTests(["review"]);
    const slash = expandInlineTriggers("run /review now");
    assert.equal(slash, "run /review now");
    const dollar = expandInlineTriggers("use $review here");
    assert.match(dollar, /Review skill body\./);
    assert.equal(dollar.includes("$review"), false);
  });
});

test("does not expand inside an unclosed code fence", () => {
  withFixtures(() => {
    const input = "before ```\n/review\nafter";
    assert.equal(expandInlineTriggers(input), input);
    const ranges = findExcludedRanges(input);
    assert.equal(
      ranges.some(([start]) => start === input.indexOf("```")),
      true,
    );
  });
});

test("resetAvailableSkills picks up newly written skills on next discover", () => {
  withFixtures((dir) => {
    writeFileSync(
      join(dir, "fresh.md"),
      "---\nname: fresh\n---\nFresh skill body.\n",
    );
    resetAvailableSkills();
    setAvailableSkillsForTests(discoverSkillsFromDirs([dir]));
    const result = expandInlineTriggers("try /fresh");
    assert.match(result, /Fresh skill body\./);
  });
});
