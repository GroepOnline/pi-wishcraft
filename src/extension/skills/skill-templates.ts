/**
 * `/skills new` templates. No marketplace, no GitHub/npm install.
 * Writes `~/.pi/agent/skills/<name>/SKILL.md` then opens $EDITOR.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SelectItem } from "@earendil-works/pi-tui";

import { getAgentPath } from "../../paths/agent-dirs.ts";
import { showSelectOverlay } from "../ui/overlay-chrome.ts";
import { invalidateSkillCache } from "./skill-registry.ts";

export const SKILL_TEMPLATE_IDS = [
  "standard",
  "browser-workflow",
  "cli-workflow",
  "review-checklist",
] as const;

export type SkillTemplateId = (typeof SKILL_TEMPLATE_IDS)[number];

export class SkillNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkillNameError";
  }
}

const TEMPLATE_META: Record<
  SkillTemplateId,
  { label: string; description: string }
> = {
  standard: {
    label: "standard",
    description: "Name, description, and a short body",
  },
  "browser-workflow": {
    label: "browser-workflow",
    description: "UI verify with screenshots, no profile wipe",
  },
  "cli-workflow": {
    label: "CLI-workflow",
    description: "Command, flags, and expected output",
  },
  "review-checklist": {
    label: "review-checklist",
    description: "Diff review gates before merge",
  },
};

export function isSkillTemplateId(value: string): value is SkillTemplateId {
  return (SKILL_TEMPLATE_IDS as readonly string[]).includes(value);
}

export function sanitizeSkillName(raw: string): string {
  const trimmed = raw.trim().toLowerCase().replace(/_/g, "-");
  if (!trimmed) {
    throw new SkillNameError("Skill name is required");
  }
  if (trimmed === "." || trimmed === ".." || trimmed.includes("..")) {
    throw new SkillNameError("Skill name cannot contain path traversal");
  }
  if (trimmed.includes("/") || trimmed.includes("\\")) {
    throw new SkillNameError("Skill name cannot contain path separators");
  }
  if (trimmed.length > 64) {
    throw new SkillNameError("Skill name must be 64 characters or fewer");
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmed)) {
    throw new SkillNameError(
      "Skill name must be lowercase letters, digits, and hyphens",
    );
  }
  return trimmed;
}

export function parseSkillsNewArgs(args: string): {
  name?: string;
  template: SkillTemplateId;
} {
  const parts = args.trim().split(/\s+/).filter(Boolean);
  if (parts[0]?.toLowerCase() === "new") parts.shift();
  if (parts.length === 0) return { template: "standard" };
  if (parts.length === 1) {
    const singleRaw = parts[0]!.toLowerCase();
    if (isSkillTemplateId(singleRaw)) return { template: singleRaw };
    return { name: parts[0], template: "standard" };
  }
  const templateRaw = parts[1]!.toLowerCase();
  if (!isSkillTemplateId(templateRaw)) {
    throw new SkillNameError(
      `Unknown template '${parts[1]}'. Use: ${SKILL_TEMPLATE_IDS.join(", ")}`,
    );
  }
  return { name: parts[0], template: templateRaw };
}

export function renderSkillTemplate(
  id: SkillTemplateId,
  name: string,
): string {
  const title = name;
  switch (id) {
    case "standard":
      return `---
name: ${title}
description: Short skill for ${title}. State when to use it in one sentence.
---

# ${title}

Use this skill when the operator asks for ${title}.

## Steps

1. Restate the goal in one line.
2. Do the work with the tools already in session.
3. Report what changed and how to verify it.
`;
    case "browser-workflow":
      return `---
name: ${title}
description: Browser UI verify for ${title}. Screenshot evidence, no profile wipe.
---

# ${title}

Use for visual checks in a real browser. Do not author layout here.

## Steps

1. Open the target URL in the existing session.
2. Snapshot the page, then act on stable refs.
3. Take a screenshot of the result.
4. Do not wipe profiles, cookies, or login state unless the operator asked.
`;
    case "cli-workflow":
      return `---
name: ${title}
description: CLI workflow for ${title}. Command, flags, and expected output.
---

# ${title}

Use when the work is a command-line tool or script.

## Steps

1. Name the binary and the exact invocation.
2. List required flags and inputs.
3. Run the command and capture exit code plus stdout/stderr.
4. State the expected output and how to rerun it.
`;
    case "review-checklist":
      return `---
name: ${title}
description: Review checklist for ${title}. Gates before merge, no rubber-stamp.
---

# ${title}

Use before marking a change merge-ready.

## Checklist

- [ ] Scope matches the request; no drive-by edits
- [ ] Tests cover the changed behavior
- [ ] No secrets in the diff
- [ ] Docs match the new surface
- [ ] Independent review is present; do not self-approve
`;
  }
}

export function writeSkillFromTemplate(
  name: string,
  template: SkillTemplateId,
  skillsRoot: string = getAgentPath("skills"),
): { filePath: string } {
  const safe = sanitizeSkillName(name);
  const dir = join(skillsRoot, safe);
  const filePath = join(dir, "SKILL.md");
  if (existsSync(filePath)) {
    throw new SkillNameError(`Skill already exists: ${safe}`);
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, renderSkillTemplate(template, safe), "utf8");
  invalidateSkillCache();
  return { filePath };
}

export function buildSkillTemplateItems(): SelectItem[] {
  return SKILL_TEMPLATE_IDS.map((id) => ({
    value: id,
    label: TEMPLATE_META[id].label,
    description: TEMPLATE_META[id].description,
  }));
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function editorCommandFor(path: string): string {
  const ed = process.env.EDITOR?.trim() || "nvim";
  return `!${ed} ${shellQuote(path)}`;
}

function appendEditorText(ctx: any, text: string): void {
  const current = ctx.ui.getEditorText?.() ?? "";
  const separator = current && !current.endsWith("\n") ? "\n" : "";
  ctx.ui.setEditorText(`${current}${separator}${text}\n`);
}

export async function pickSkillTemplate(
  ctx: any,
): Promise<SkillTemplateId | null> {
  const selected = await showSelectOverlay(
    ctx,
    "New skill template",
    "↑↓ navigate • enter choose • esc cancel",
    buildSkillTemplateItems(),
    SKILL_TEMPLATE_IDS.length,
  );
  return selected && isSkillTemplateId(selected.value)
    ? selected.value
    : null;
}

export async function runSkillsNew(ctx: any, args: string): Promise<void> {
  let parsed: { name?: string; template: SkillTemplateId };
  try {
    parsed = parseSkillsNewArgs(args);
  } catch (error) {
    ctx.ui.notify(
      error instanceof Error ? error.message : String(error),
      "error",
    );
    return;
  }

  let template = parsed.template;
  let name = parsed.name;
  if (!name) {
    const picked = await pickSkillTemplate(ctx);
    if (!picked) return;
    template = picked;
    appendEditorText(ctx, `/skills new <name> ${template}`);
    ctx.ui.notify(
      `Replace <name> and run to create a ${template} skill.`,
      "info",
    );
    return;
  }

  try {
    const { filePath } = writeSkillFromTemplate(name, template);
    appendEditorText(ctx, editorCommandFor(filePath));
    ctx.ui.notify(`Created ${name} (${template}). Enter runs the editor.`, "info");
  } catch (error) {
    ctx.ui.notify(
      error instanceof Error ? error.message : String(error),
      "error",
    );
  }
}
