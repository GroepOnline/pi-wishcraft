import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSkillFrontmatter } from "../src/core/frontmatter.ts";
import {
  listSkills,
  readSkillBody,
  showSkillManager,
} from "../src/extension/skills/skill-manager.ts";

test("parseSkillFrontmatter extracts name and description", () => {
  const fm = parseSkillFrontmatter(`---
name: foo
description: Does the foo thing
---
body`);
  assert.equal(fm.name, "foo");
  assert.equal(fm.description, "Does the foo thing");
});

test("parseSkillFrontmatter returns nulls without frontmatter", () => {
  const fm = parseSkillFrontmatter("plain text");
  assert.equal(fm.name, null);
  assert.equal(fm.description, null);
});

test("readSkillBody strips frontmatter and trims", () => {
  const dir = mkdtempSync(join(tmpdir(), "skill-manager-"));
  const file = join(dir, "SKILL.md");
  writeFileSync(
    file,
    `---
name: bar
description: Bar
---

Het echte  body.
`,
  );
  assert.equal(readSkillBody(file), "Het echte  body.");
});

test("listSkills returns SkillInfo entries", () => {
  const skills = listSkills();
  assert.ok(Array.isArray(skills));
  for (const skill of skills) {
    assert.equal(typeof skill.name, "string");
    assert.ok(skill.path.length > 0);
  }
});

function stubTheme() {
  return {
    fg: (_color: string, text: string) => text,
    bold: (text: string) => text,
  };
}

test("showSkillManager ctrl+n resolves to new for the overlay flow", async () => {
  const tui = { requestRender: () => {} };
  const ctx = {
    cwd: "/tmp/project",
    ui: {
      notify: () => {},
      custom: (renderFn: any) =>
        new Promise<"new" | null>((resolve) => {
          const component = renderFn(tui, stubTheme(), {}, (result: "new" | null) => {
            resolve(result);
          });
          component.handleInput("\x0e");
        }),
    },
  };
  const result = await showSkillManager(ctx);
  assert.equal(result, "new");
});

test("showSkillManager keeps the overlay open when the catalog is empty", () => {
  const source = [
    "../src/extension/skills/skill-manager.ts",
    "../src/extension/skills/skill-manager-view.ts",
    "../src/extension/skills/skill-manager-input.ts",
    "../src/extension/skills/skill-manager-utils.ts",
  ]
    .map((f) => readFileSync(join(import.meta.dirname, f), "utf8"))
    .join("\n");
  assert.doesNotMatch(
    source,
    /if \(entries\.length === 0\)\s*\{\s*ctx\.ui\.notify\("No skills found", "info"\);\s*return null;/,
  );
  assert.match(source, /No skills installed — ctrl\+n to create one/);
});

test("skill-manager.ts routes ctrl+n into runSkillsNew", () => {
  const source = [
    "../src/extension/skills/skill-manager.ts",
    "../src/extension/skills/skill-manager-view.ts",
    "../src/extension/skills/skill-manager-input.ts",
    "../src/extension/skills/skill-manager-utils.ts",
  ]
    .map((f) => readFileSync(join(import.meta.dirname, f), "utf8"))
    .join("\n");
  assert.match(source, /result === "new"\) await runSkillsNew\(ctx, ""\)/);
});
