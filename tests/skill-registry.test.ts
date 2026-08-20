import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applySkillFilter,
  invalidateSkillCache,
  loadSkillCatalog,
  type SkillEntry,
} from "../src/extension/skills/skill-registry.ts";

function makeEntry(partial: Partial<SkillEntry>): SkillEntry {
  return {
    name: "x",
    description: "",
    filePath: "/x/SKILL.md",
    baseDir: "/x",
    category: "global",
    disableModelInvocation: false,
    sizeBytes: 10,
    lineCount: 1,
    mtimeMs: 0,
    frontmatterKeys: [],
    ...partial,
  };
}

test("applySkillFilter filters on name, description and path", () => {
  const entries = [
    makeEntry({ name: "chef-foo", description: "kook een ei", filePath: "/a/chef.md" }),
    makeEntry({ name: "zsh-setup", description: "manage zsh", filePath: "/b/zsh.md" }),
    makeEntry({ name: "fleet", description: "ssh into machines", filePath: "/c/fleet.md" }),
  ];
  const out = applySkillFilter(entries, "zsh", "all", "name", new Map());
  assert.deepEqual(out.map((e) => e.name), ["zsh-setup"]); // naammatch
  const byDesc = applySkillFilter(entries, "kook", "all", "name", new Map());
  assert.deepEqual(byDesc.map((e) => e.name), ["chef-foo"]); // beschrijvingsmatch
  const byPath = applySkillFilter(entries, "c/fleet", "all", "name", new Map());
  assert.deepEqual(byPath.map((e) => e.name), ["fleet"]); // padmatch
});

test("applySkillFilter filters on category", () => {
  const entries = [
    makeEntry({ name: "a", category: "global" }),
    makeEntry({ name: "b", category: "project" }),
    makeEntry({ name: "c", category: "prompts" }),
  ];
  assert.equal(applySkillFilter(entries, "", "project", "name", new Map()).length, 1);
  assert.equal(applySkillFilter(entries, "", "all", "name", new Map()).length, 3);
});

test("applySkillFilter sorts by usage count desc, name asc within tie", () => {
  const entries = [
    makeEntry({ name: "aaa" }),
    makeEntry({ name: "bbb" }),
    makeEntry({ name: "ccc" }),
  ];
  const usage = new Map([
    ["bbb", { count: 5, lastUsed: 1 }],
    ["ccc", { count: 9, lastUsed: 1 }],
  ]);
  const out = applySkillFilter(entries, "", "all", "usage", usage);
  assert.deepEqual(out.map((e) => e.name), ["ccc", "bbb", "aaa"]);
});

test("loadSkillCatalog categorizes global vs loose prompts and dedupes", () => {
  const agentDir = mkdtempSync(join(tmpdir(), "wishcraft-reg-"));
  const skillsDir = join(agentDir, "skills");
  mkdirSync(skillsDir, { recursive: true });
  writeFileSync(
    join(skillsDir, "global-skill.md"),
    "---\nname: global-skill\ndescription: from agent dir\n---\nbody\n",
  );
  const cwd = mkdtempSync(join(tmpdir(), "wishcraft-reg-cwd-"));
  mkdirSync(join(cwd, ".pi", "prompts"), { recursive: true });
  writeFileSync(join(cwd, ".pi", "prompts", "loose.md"), "Losse prompt zonder frontmatter\n");
  // bestanden NIET in loose dirs maar wel loose in global → core weigert (geen
  // description), loose fallback dekt alleen extra dirs; dus alleen via prompts
  process.env.PI_CODING_AGENT_DIR = agentDir;
  try {
    const prevCwd = process.cwd();
    process.chdir(cwd);
    invalidateSkillCache();
    const cat = loadSkillCatalog(cwd);
    const global = cat.find((e) => e.name === "global-skill");
    assert.ok(global, "global skill found");
    assert.equal(global.category, "global");
    assert.ok(global.description.includes("agent dir"));
    const loose = cat.find((e) => e.name === "loose");
    assert.ok(loose, "loose prompt found via fallback");
    assert.equal(loose.category, "prompts");
    assert.ok(loose.warning?.includes("no description"));
    process.chdir(prevCwd);
  } finally {
    delete process.env.PI_CODING_AGENT_DIR;
    invalidateSkillCache();
    rmSync(agentDir, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("loadSkillCatalog includes core-rejected skills from diagnostics", () => {
  const agentDir = mkdtempSync(join(tmpdir(), "wishcraft-reg-reject-"));
  const skillDir = join(agentDir, "skills", "broken-skill");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, "SKILL.md"),
    "---\nname: broken-skill\n---\nbody without description\n",
  );
  const cwd = mkdtempSync(join(tmpdir(), "wishcraft-reg-reject-cwd-"));
  process.env.PI_CODING_AGENT_DIR = agentDir;
  try {
    const prevCwd = process.cwd();
    process.chdir(cwd);
    invalidateSkillCache();
    const cat = loadSkillCatalog(cwd);
    const rejected = cat.find((e) => e.name === "broken-skill");
    assert.ok(rejected, "rejected skill surfaced via diagnostics");
    assert.equal(rejected.filePath, join(skillDir, "SKILL.md"));
    assert.equal(rejected.description, "");
    assert.ok(rejected.warning?.includes("description"));
    process.chdir(prevCwd);
  } finally {
    delete process.env.PI_CODING_AGENT_DIR;
    invalidateSkillCache();
    rmSync(agentDir, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("usage ledger persists across recordSkillUsage calls", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "wishcraft-usage-"));
  process.env.PI_CODING_AGENT_DIR = agentDir;
  try {
    const mod = await import("../src/extension/skills/skill-registry.ts");
    mod.recordSkillUsage("my-skill");
    mod.recordSkillUsage("my-skill");
    mod.flushSkillUsage(); // write is debounced; flush before the assert
    const file = readFileSync(join(agentDir, "skill-usage.json"), "utf8");
    const parsed = JSON.parse(file);
    assert.equal(parsed["my-skill"].count, 2);
  } finally {
    delete process.env.PI_CODING_AGENT_DIR;
    rmSync(agentDir, { recursive: true, force: true });
  }
});
