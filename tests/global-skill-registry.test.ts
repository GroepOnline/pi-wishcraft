import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadGlobalSkillRegistry } from "../src/extension/skills/global-registry.ts";

describe("global skill registry", () => {
  afterEach(() => { delete process.env.CHEFGROEP_SKILL_REGISTRY; });
  test("parses routing metadata without reading skill bodies", () => {
    const dir = mkdtempSync(join(tmpdir(), "wishcraft-registry-"));
    const path = join(dir, "skills.json");
    writeFileSync(path, JSON.stringify({schema:"chefgroep-global-skill-registry/v1",skills:[{name:"demo",description:"Demo",category:"engineering",family:"testing",meta_skill:"demo-meta",role:"router",router_parent:"category-router",mounts:["agents"],drift:true,canonical:{path:"~/demo/SKILL.md"}}]}));
    const rows = loadGlobalSkillRegistry(path);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.category, "engineering");
    assert.equal(rows[0]?.routerParent, "category-router");
    assert.equal(rows[0]?.drift, true);
  });
});
