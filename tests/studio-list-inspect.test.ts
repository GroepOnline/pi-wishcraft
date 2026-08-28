import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildListRows,
  filterListRows,
  badgeForCategory,
  type ListRow,
} from "../src/studio/list.ts";
import { resolveReferences } from "../src/studio/inspect.ts";
import type { SkillEntry } from "../src/extension/skills/skill-registry.ts";

const makeEntry = (overrides: Partial<SkillEntry>): SkillEntry => ({
  name: "sample",
  description: "Sample description",
  filePath: "/tmp/sample/SKILL.md",
  baseDir: "/tmp/sample",
  category: "project",
  disableModelInvocation: false,
  sizeBytes: 100,
  lineCount: 5,
  mtimeMs: 0,
  frontmatterKeys: ["name", "description"],
  trigger: null,
  ...overrides,
});

test("buildListRows: attaches badges by category and copies the fields the list pane renders", () => {
  const entries: SkillEntry[] = [
    makeEntry({ name: "alpha", category: "project" }),
    makeEntry({ name: "beta", category: "global" }),
    makeEntry({ name: "gamma", category: "prompts" }),
  ];
  const rows = buildListRows(entries);
  assert.equal(rows.length, 3);
  assert.equal(rows[0]?.badge, "proj");
  assert.equal(rows[1]?.badge, "glob");
  assert.equal(rows[2]?.badge, "prm");
  assert.equal(rows[0]?.name, "alpha");
  assert.equal(rows[0]?.description, "Sample description");
});

test("badgeForCategory: returns a short string per category", () => {
  assert.equal(badgeForCategory("project"), "proj");
  assert.equal(badgeForCategory("global"), "glob");
  assert.equal(badgeForCategory("prompts"), "prm");
  assert.equal(badgeForCategory("extra"), "extra");
});

test("filterListRows: substring matches name or description, case-insensitive", () => {
  const rows: ListRow[] = [
    { name: "alpha", description: "First skill", badge: "proj" },
    { name: "beta", description: "Other", badge: "glob" },
    { name: "alpha-beta", description: "Combined", badge: "proj" },
  ];
  assert.equal(filterListRows(rows, "alpha").length, 2);
  assert.equal(filterListRows(rows, "OTHER").length, 1);
  assert.equal(filterListRows(rows, "missing").length, 0);
  assert.equal(filterListRows(rows, "").length, 3);
});

test("resolveReferences: relative `references/` and `scripts/` paths are resolved against the skill base dir", () => {
  const dir = mkdtempSync(join(tmpdir(), "studio-inspect-"));
  mkdirSync(join(dir, "references"));
  writeFileSync(join(dir, "references", "notes.md"), "hi", "utf8");
  writeFileSync(join(dir, "SKILL.md"), "uses [notes](references/notes.md)", "utf8");
  const refs = resolveReferences("uses [notes](references/notes.md)", dir);
  assert.equal(refs.length, 1);
  assert.equal(refs[0]?.path, join(dir, "references", "notes.md"));
  assert.equal(refs[0]?.exists, true);
});

test("resolveReferences: a missing reference file is flagged but listed (broken marker data)", () => {
  const dir = mkdtempSync(join(tmpdir(), "studio-inspect-"));
  const refs = resolveReferences("see [absent](references/missing.md)", dir);
  assert.equal(refs.length, 1);
  assert.equal(refs[0]?.exists, false);
});

test("resolveReferences: absolute URLs and external http(s) refs are ignored", () => {
  const dir = mkdtempSync(join(tmpdir(), "studio-inspect-"));
  const refs = resolveReferences("see [ext](https://example.com/x.md) and [local](references/local.md)", dir);
  assert.equal(refs.length, 1);
  assert.equal(refs[0]?.path, join(dir, "references", "local.md"));
});
