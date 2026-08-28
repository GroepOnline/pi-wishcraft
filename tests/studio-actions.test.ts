import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runStudioAction, type ActionContext } from "../src/studio/actions.ts";
import type { SkillTemplateId } from "../src/extension/skills/skill-templates.ts";

const okCtx = (): ActionContext => ({ confirm: async () => true });
const noCtx = (): ActionContext => ({ confirm: async () => false });

test("create: writes SKILL.md with frontmatter for the named skill", async () => {
  const root = mkdtempSync(join(tmpdir(), "studio-actions-"));
  const result = await runStudioAction(
    { type: "create", name: "My Skill", template: "standard", skillsRoot: root },
    okCtx(),
  );
  assert.equal(result.kind, "ok");
  const filePath = join(root, "my-skill", "SKILL.md");
  assert.ok(existsSync(filePath), "SKILL.md should exist");
  const body = readFileSync(filePath, "utf8");
  assert.match(body, /^---/);
  assert.match(body, /name: my-skill/);
});

test("create: refuses to overwrite an existing skill without confirm", async () => {
  const root = mkdtempSync(join(tmpdir(), "studio-actions-"));
  await runStudioAction(
    { type: "create", name: "dup", template: "standard", skillsRoot: root },
    okCtx(),
  );
  const result = await runStudioAction(
    { type: "create", name: "dup", template: "standard", skillsRoot: root },
    noCtx(),
  );
  assert.equal(result.kind, "declined");
  const filePath = join(root, "dup", "SKILL.md");
  assert.ok(existsSync(filePath), "original file still exists");
  const body = readFileSync(filePath, "utf8");
  assert.ok(!body.includes("overwritten"), "body unchanged");
});

test("create: confirm=true allows overwrite (kills + rewrites)", async () => {
  const root = mkdtempSync(join(tmpdir(), "studio-actions-"));
  await runStudioAction(
    { type: "create", name: "dup", template: "standard", skillsRoot: root },
    okCtx(),
  );
  const filePath = join(root, "dup", "SKILL.md");
  writeFileSync(filePath, "MARKER-OLD", "utf8");
  const result = await runStudioAction(
    { type: "create", name: "dup", template: "standard", skillsRoot: root },
    okCtx(),
  );
  assert.equal(result.kind, "ok");
  const body = readFileSync(filePath, "utf8");
  assert.ok(!body.includes("MARKER-OLD"));
  assert.match(body, /^---/);
});

test("create: rejects an invalid skill name without writing", async () => {
  const root = mkdtempSync(join(tmpdir(), "studio-actions-"));
  const result = await runStudioAction(
    { type: "create", name: "../escape", template: "standard", skillsRoot: root },
    okCtx(),
  );
  assert.equal(result.kind, "error");
  const escapePath = join(root, "escape", "SKILL.md");
  assert.ok(!existsSync(escapePath));
});

test("doctor: returns a result for an empty skills root without throwing", async () => {
  const root = mkdtempSync(join(tmpdir(), "studio-actions-"));
  const result = await runStudioAction({ type: "doctor", cwd: root }, okCtx());
  assert.equal(result.kind, "ok");
  assert.equal(result.message.length > 0, true);
});
