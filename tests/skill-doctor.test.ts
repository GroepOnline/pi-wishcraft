import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { SkillEntry, SkillUsage } from "../src/extension/skills/skill-registry.ts";
import { invalidateSkillCache, loadSkillCatalog } from "../src/extension/skills/skill-registry.ts";
import {
  SKILL_DESCRIPTION_MAX_CHARS,
  collectSkillDoctorInputs,
  diagnoseSkills,
  formatSkillDoctorRow,
  hasClosedFrontmatter,
  hasUnclosedFrontmatter,
  type SkillDoctorIssue,
  type SkillDoctorStatus,
} from "../src/extension/skills/skill-doctor.ts";
import { registerSkillManagerCommand } from "../src/extension/skills/skill-manager.ts";

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

const longDescription = "x".repeat(SKILL_DESCRIPTION_MAX_CHARS + 1);

const diagnoseCases: {
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
        filePath: "/tmp/open/SKILL.md",
        category: "project",
        description: "has text",
        isDirectorySkill: true,
      }),
    ],
    usage: new Map([["open", { count: 1, lastUsed: 1 }]]),
    contents: new Map([
      ["/tmp/open/SKILL.md", "---\nname: open\ndescription: has text\n"],
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
        description: longDescription,
        frontmatterKeys: ["name", "description"],
      }),
    ],
    usage: new Map([["wordy", { count: 3, lastUsed: 1 }]]),
    contents: new Map([
      ["/tmp/wordy.md", `---\nname: wordy\ndescription: ${longDescription}\n---\nbody`],
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
        isDirectorySkill: true,
        frontmatterKeys: ["name", "description"],
      }),
      entry({
        name: "shared",
        filePath: "/proj/.pi/skills/shared/SKILL.md",
        category: "project",
        description: "ok",
        isDirectorySkill: true,
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
    label: "zero usage ledger count",
    entries: [
      entry({
        name: "lonely",
        filePath: "/tmp/lonely/SKILL.md",
        category: "global",
        description: "fine",
        isDirectorySkill: true,
        frontmatterKeys: ["name", "description"],
      }),
    ],
    usage: new Map(),
    contents: new Map([
      ["/tmp/lonely/SKILL.md", "---\nname: lonely\ndescription: fine\n---\n"],
    ]),
    expect: ["lonely:unused:warn"],
  },
  {
    label: "prompts loose file without frontmatter",
    entries: [
      entry({
        name: "loose",
        filePath: "/tmp/prompts/loose.md",
        category: "prompts",
        description: "",
        warning: "no description",
      }),
    ],
    usage: new Map(),
    contents: new Map([["/tmp/prompts/loose.md", "Losse prompt zonder frontmatter\n"]]),
    expect: ["loose:missing-description:fail", "loose:unused:warn"],
    absent: ["loose:missing-frontmatter:fail"],
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
        filePath: "/tmp/ok/SKILL.md",
        category: "global",
        description: "fine",
        isDirectorySkill: true,
        frontmatterKeys: ["name", "description"],
      }),
    ],
    usage: new Map([["ok", { count: 1, lastUsed: 1 }]]),
    contents: new Map([["/tmp/ok/SKILL.md", "---\nname: ok\ndescription: fine\n---\n"]]),
    expect: ["catalog:none:ok"],
  },
];

for (const diagnoseCase of diagnoseCases) {
  test(`diagnoseSkills table: ${diagnoseCase.label}`, () => {
    const rows = diagnoseSkills(diagnoseCase.entries, diagnoseCase.usage, diagnoseCase.contents);
    const issues = rows.map((row) => rowKey(row.skill, row.issue, row.status));

    for (const key of diagnoseCase.expect) {
      assert.ok(
        issues.includes(key),
        `${diagnoseCase.label}: expected ${key}, got ${issues.join(", ")}`,
      );
    }
    for (const key of diagnoseCase.absent ?? []) {
      assert.equal(
        issues.includes(key),
        false,
        `${diagnoseCase.label}: did not expect ${key}`,
      );
    }

    const budgetRow = rows.find((row) => row.issue === "description-budget");
    if (budgetRow) {
      assert.match(formatSkillDoctorRow(budgetRow), /\[warn\].*description over budget/);
      assert.equal(
        budgetRow.detail,
        `${SKILL_DESCRIPTION_MAX_CHARS + 1}/${SKILL_DESCRIPTION_MAX_CHARS} chars`,
      );
    }

    const missingFmRow = rows.find((row) => row.issue === "missing-frontmatter");
    if (missingFmRow) {
      assert.match(formatSkillDoctorRow(missingFmRow), /\[fail\].*missing frontmatter/);
    }

    if (diagnoseCase.label === "clean catalog") {
      assert.equal(rows.length, 1);
      assert.equal(formatSkillDoctorRow(rows[0]!), "[ok]   catalog · no issues");
    }
  });
}

test("collectSkillDoctorInputs diagnoses rejected nested global and project SKILL.md", () => {
  const agentDir = mkdtempSync(join(tmpdir(), "wishcraft-doctor-agent-"));
  const globalNested = join(agentDir, "skills", "nested-global", "SKILL.md");
  mkdirSync(dirname(globalNested), { recursive: true });
  writeFileSync(globalNested, "---\nname: nested-global\ndescription:\n---\nbody\n");

  const cwd = mkdtempSync(join(tmpdir(), "wishcraft-doctor-cwd-"));
  const projectNested = join(cwd, ".pi", "skills", "nested-project", "SKILL.md");
  mkdirSync(dirname(projectNested), { recursive: true });
  writeFileSync(projectNested, "plain body without frontmatter\n");

  process.env.PI_CODING_AGENT_DIR = agentDir;
  const prevCwd = process.cwd();
  try {
    process.chdir(cwd);
    invalidateSkillCache();
    const catalog = loadSkillCatalog(cwd);
    assert.ok(
      catalog.some((skill) => skill.filePath === globalNested),
      "rejected nested global SKILL.md is surfaced in catalog",
    );
    assert.ok(
      catalog.some((skill) => skill.filePath === projectNested),
      "rejected nested project SKILL.md is surfaced in catalog",
    );

    const { entries, usage, contents } = collectSkillDoctorInputs(cwd);
    const rows = diagnoseSkills(entries, usage, contents);
    assert.ok(
      rows.some(
        (row) =>
          row.skill === "nested-global" &&
          row.issue === "missing-description" &&
          row.status === "fail",
      ),
    );
    assert.ok(
      rows.some(
        (row) =>
          row.skill === "nested-project" &&
          row.issue === "missing-frontmatter" &&
          row.status === "fail",
      ),
    );
  } finally {
    process.chdir(prevCwd);
    delete process.env.PI_CODING_AGENT_DIR;
    invalidateSkillCache();
    rmSync(agentDir, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("registered /skills command dispatches doctor to the overlay runner", async () => {
  const commands = new Map<string, { handler: (args: string, ctx: unknown) => Promise<void> }>();
  let doctorInvoked = false;
  const pi = {
    registerCommand(name: string, command: { handler: (args: string, ctx: unknown) => Promise<void> }) {
      commands.set(name, command);
    },
  } as never;
  const rt = { enabled: true } as never;
  registerSkillManagerCommand(pi, rt, {
    runDoctor: async () => {
      doctorInvoked = true;
    },
  });

  const skills = commands.get("skills");
  assert.ok(skills?.handler);
  await skills.handler("doctor", {
    hasUI: true,
    cwd: process.cwd(),
    ui: { notify() {} },
  });
  assert.ok(doctorInvoked, "expected /skills doctor to invoke the doctor runner");
});
