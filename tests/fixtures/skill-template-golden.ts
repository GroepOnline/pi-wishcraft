import type { SkillTemplateId } from "../../src/extension/skills/skill-templates.ts";

/** Fixed-name golden output for each built-in template. */
export const SKILL_TEMPLATE_GOLDEN: Record<SkillTemplateId, string> = {
  standard: `---
name: demo-skill
description: Short skill for demo-skill. State when to use it in one sentence.
---

# demo-skill

Use this skill when the operator asks for demo-skill.

## Steps

1. Restate the goal in one line.
2. Do the work with the tools already in session.
3. Report what changed and how to verify it.
`,
  "browser-workflow": `---
name: demo-skill
description: Browser UI verify for demo-skill. Screenshot evidence, no profile wipe.
---

# demo-skill

Use for visual checks in a real browser. Do not author layout here.

## Steps

1. Open the target URL in the existing session.
2. Snapshot the page, then act on stable refs.
3. Take a screenshot of the result.
4. Do not wipe profiles, cookies, or login state unless the operator asked.
`,
  "cli-workflow": `---
name: demo-skill
description: CLI workflow for demo-skill. Command, flags, and expected output.
---

# demo-skill

Use when the work is a command-line tool or script.

## Steps

1. Name the binary and the exact invocation.
2. List required flags and inputs.
3. Run the command and capture exit code plus stdout/stderr.
4. State the expected output and how to rerun it.
`,
  "review-checklist": `---
name: demo-skill
description: Review checklist for demo-skill. Gates before merge, no rubber-stamp.
---

# demo-skill

Use before marking a change merge-ready.

## Checklist

- [ ] Scope matches the request; no drive-by edits
- [ ] Tests cover the changed behavior
- [ ] No secrets in the diff
- [ ] Docs match the new surface
- [ ] Independent review is present; do not self-approve
`,
};
