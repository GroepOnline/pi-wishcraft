import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SkillEntry, SkillUsage } from "../src/extension/skills/skill-registry.ts";
import {
  SKILL_DESCRIPTION_MAX_CHARS,
  diagnoseSkills,
  formatSkillDoctorRow,
  hasClosedFrontmatter,
  hasUnclosedFrontmatter,
} from "../src/extension/skills/skill-doctor.ts";

const root = join(import.meta.dirname, "..");

function entry(
  partial: Partial<SkillEntry> & Pick<SkillEntry, "name" | "filePath" | "category">,
): SkillEntry {
  return {
    description: "",
    baseDir: "/tmp",
    disableModelInvocation: false,
    sizeBytes: 0,
    lineCount: 0,
    mtimeMs: 0,
    frontmatterKeys: [],
    ...partial,
  };
}

test("hasUnclosedFrontmatter / hasClosedFrontmatter", () => {
  assert.equal(hasUnclosedFrontmatter("plain"), false);
  assert.equal(hasClosedFrontmatter("plain"), false);
  assert.equal(hasUnclosedFrontmatter("---\nname: x\n"), true);
  assert.equal(hasClosedFrontmatter("---\nname: x\n---\nbody"), true);
  assert.equal(hasUnclosedFrontmatter("---\nname: x\n---\nbody"), false);
});

test("diagnoseSkills reports missing frontmatter, missing description, budget, unused, and dupes", () => {
  const long = "x".repeat(SKILL_DESCRIPTION_MAX_CHARS + 1);
  const entries = [
    entry({
      name: "broken",
      filePath: "/tmp/broken.md",
      category: "global",
      description: "",
    }),
    entry({
      name: "wordy",
      filePath: "/tmp/wordy.md",
      category: "global",
      description: long,
      frontmatterKeys: ["name", "description"],
    }),
    entry({
      name: "shared",
      filePath: "/home/.pi/agent/skills/shared/SKILL.md",
      category: "global",
      description: "ok",
      frontmatterKeys: ["name", "description"],
    }),
    entry({
      name: "shared",
      filePath: "/proj/.pi/skills/shared/SKILL.md",
      category: "project",
      description: "ok",
      frontmatterKeys: ["name", "description"],
    }),
    entry({
      name: "healthy",
      filePath: "/tmp/healthy.md",
      category: "global",
      description: "short",
      frontmatterKeys: ["name", "description"],
    }),
  ];
  const usage = new Map<string, SkillUsage>([
    ["wordy", { count: 3, lastUsed: 1 }],
    ["shared", { count: 1, lastUsed: 1 }],
    ["healthy", { count: 2, lastUsed: 1 }],
  ]);
  const contents = new Map<string, string>([
    ["/tmp/broken.md", "no fences"],
    ["/tmp/wordy.md", `---\nname: wordy\ndescription: ${long}\n---\nbody`],
    [
      "/home/.pi/agent/skills/shared/SKILL.md",
      "---\nname: shared\ndescription: ok\n---\n",
    ],
    ["/proj/.pi/skills/shared/SKILL.md", "---\nname: shared\ndescription: ok\n---\n"],
    ["/tmp/healthy.md", "---\nname: healthy\ndescription: short\n---\n"],
  ]);

  const rows = diagnoseSkills(entries, usage, contents);
  const issues = rows.map((r) => `${r.skill}:${r.issue}:${r.status}`);
  assert.ok(issues.includes("broken:missing-frontmatter:fail"));
  assert.ok(issues.includes("wordy:description-budget:warn"));
  assert.equal(
    rows.filter((r) => r.issue === "duplicate-global-project").length,
    2,
  );
  assert.ok(issues.includes("broken:unused:warn"));
  assert.equal(
    rows.some((r) => r.skill === "healthy"),
    false,
  );
  assert.match(
    formatSkillDoctorRow(rows.find((r) => r.issue === "missing-frontmatter")!),
    /\[fail\] broken · missing frontmatter/,
  );
  assert.match(
    formatSkillDoctorRow(rows.find((r) => r.issue === "description-budget")!),
    /\[warn\] wordy · description over budget/,
  );
  assert.equal(
    rows.find((r) => r.issue === "description-budget")?.detail,
    `${SKILL_DESCRIPTION_MAX_CHARS + 1}/${SKILL_DESCRIPTION_MAX_CHARS} chars`,
  );
});

test("diagnoseSkills flags unclosed frontmatter", () => {
  const rows = diagnoseSkills(
    [
      entry({
        name: "open",
        filePath: "/tmp/open.md",
        category: "project",
        description: "has text",
      }),
    ],
    new Map([["open", { count: 1, lastUsed: 1 }]]),
    new Map([["/tmp/open.md", "---\nname: open\ndescription: has text\n"]]),
  );
  assert.equal(rows[0]?.issue, "unclosed-frontmatter");
  assert.equal(rows[0]?.status, "fail");
});

test("diagnoseSkills returns a single ok row when the catalog is clean", () => {
  const rows = diagnoseSkills(
    [
      entry({
        name: "ok",
        filePath: "/tmp/ok.md",
        category: "global",
        description: "fine",
        frontmatterKeys: ["name", "description"],
      }),
    ],
    new Map([["ok", { count: 1, lastUsed: 1 }]]),
    new Map([["/tmp/ok.md", "---\nname: ok\ndescription: fine\n---\n"]]),
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.status, "ok");
  assert.equal(formatSkillDoctorRow(rows[0]!), "[ok]   catalog · no issues");
});

test("skill-manager.ts dispatches /skills doctor", () => {
  const source = readFileSync(
    join(root, "src/extension/skills/skill-manager.ts"),
    "utf8",
  );
  assert.match(source, /from "\.\/skill-doctor\.ts"/);
  assert.match(source, /sub === "doctor"/);
  assert.match(source, /runSkillDoctor/);
});
