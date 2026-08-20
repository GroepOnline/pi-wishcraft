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
  type SkillDoctorIssue,
  type SkillDoctorStatus,
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

function rowKey(skill: string, issue: SkillDoctorIssue, status: SkillDoctorStatus): string {
  return `${skill}:${issue}:${status}`;
}

test("hasUnclosedFrontmatter / hasClosedFrontmatter", () => {
  assert.equal(hasUnclosedFrontmatter("plain"), false);
  assert.equal(hasClosedFrontmatter("plain"), false);
  assert.equal(hasUnclosedFrontmatter("---\nname: x\n"), true);
  assert.equal(hasClosedFrontmatter("---\nname: x\n---\nbody"), true);
  assert.equal(hasUnclosedFrontmatter("---\nname: x\n---\nbody"), false);
});

test("diagnoseSkills table-driven issue detection", () => {
  const long = "x".repeat(SKILL_DESCRIPTION_MAX_CHARS + 1);
  const cases: {
    label: string;
    entries: SkillEntry[];
    usage: Map<string, SkillUsage>;
    contents: Map<string, string>;
    expect: string[];
    absent?: string[];
  }[] = [
    {
      label: "missing frontmatter",
      entries: [
        entry({
          name: "broken",
          filePath: "/tmp/broken.md",
          category: "global",
          description: "",
        }),
      ],
      usage: new Map(),
      contents: new Map([["/tmp/broken.md", "no fences"]]),
      expect: ["broken:missing-frontmatter:fail", "broken:unused:warn"],
    },
    {
      label: "unclosed frontmatter",
      entries: [
        entry({
          name: "open",
          filePath: "/tmp/open.md",
          category: "project",
          description: "has text",
        }),
      ],
      usage: new Map([["open", { count: 1, lastUsed: 1 }]]),
      contents: new Map([
        ["/tmp/open.md", "---\nname: open\ndescription: has text\n"],
      ]),
      expect: ["open:unclosed-frontmatter:fail"],
    },
    {
      label: "description budget",
      entries: [
        entry({
          name: "wordy",
          filePath: "/tmp/wordy.md",
          category: "global",
          description: long,
          frontmatterKeys: ["name", "description"],
        }),
      ],
      usage: new Map([["wordy", { count: 3, lastUsed: 1 }]]),
      contents: new Map([
        ["/tmp/wordy.md", `---\nname: wordy\ndescription: ${long}\n---\nbody`],
      ]),
      expect: ["wordy:description-budget:warn"],
    },
    {
      label: "global/project duplicate",
      entries: [
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
      ],
      usage: new Map([["shared", { count: 1, lastUsed: 1 }]]),
      contents: new Map([
        [
          "/home/.pi/agent/skills/shared/SKILL.md",
          "---\nname: shared\ndescription: ok\n---\n",
        ],
        ["/proj/.pi/skills/shared/SKILL.md", "---\nname: shared\ndescription: ok\n---\n"],
      ]),
      expect: [
        "shared:duplicate-global-project:warn",
        "shared:duplicate-global-project:warn",
      ],
    },
    {
      label: "registry warning passthrough",
      entries: [
        entry({
          name: "warned",
          filePath: "/tmp/warned.md",
          category: "global",
          description: "fine",
          warning: "description is required",
          frontmatterKeys: ["name", "description"],
        }),
      ],
      usage: new Map([["warned", { count: 1, lastUsed: 1 }]]),
      contents: new Map([
        ["/tmp/warned.md", "---\nname: warned\ndescription: fine\n---\n"],
      ]),
      expect: ["warned:warning:warn"],
    },
    {
      label: "clean catalog",
      entries: [
        entry({
          name: "ok",
          filePath: "/tmp/ok.md",
          category: "global",
          description: "fine",
          frontmatterKeys: ["name", "description"],
        }),
      ],
      usage: new Map([["ok", { count: 1, lastUsed: 1 }]]),
      contents: new Map([["/tmp/ok.md", "---\nname: ok\ndescription: fine\n---\n"]]),
      expect: ["catalog:none:ok"],
    },
  ];

  for (const c of cases) {
    const rows = diagnoseSkills(c.entries, c.usage, c.contents);
    const issues = rows.map((r) => rowKey(r.skill, r.issue, r.status));
    for (const key of c.expect) {
      assert.ok(issues.includes(key), `${c.label}: expected ${key}, got ${issues.join(", ")}`);
    }
    for (const key of c.absent ?? []) {
      assert.equal(
        issues.includes(key),
        false,
        `${c.label}: did not expect ${key}`,
      );
    }
  }
});

test("diagnoseSkills mixed catalog formatting", () => {
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
      name: "healthy",
      filePath: "/tmp/healthy.md",
      category: "global",
      description: "short",
      frontmatterKeys: ["name", "description"],
    }),
  ];
  const usage = new Map<string, SkillUsage>([
    ["wordy", { count: 3, lastUsed: 1 }],
    ["healthy", { count: 2, lastUsed: 1 }],
  ]);
  const contents = new Map<string, string>([
    ["/tmp/broken.md", "no fences"],
    ["/tmp/wordy.md", `---\nname: wordy\ndescription: ${long}\n---\nbody`],
    ["/tmp/healthy.md", "---\nname: healthy\ndescription: short\n---\n"],
  ]);

  const rows = diagnoseSkills(entries, usage, contents);
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
  assert.equal(rows.some((r) => r.skill === "healthy"), false);
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
