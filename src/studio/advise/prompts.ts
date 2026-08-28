import type { AdviseContextSection } from "./context.ts";

export type AdviseMode = "explain" | "integrate" | "examples" | "improve";

export interface AdvisePromptInput {
  skillName: string;
  body: string;
  references: AdviseContextSection[];
  wiki: AdviseContextSection[];
}

export interface AdvisePrompt {
  system: string;
  user: string;
}

const SYSTEM_BASE =
  "You advise a chef who is building or auditing a skill. Reply in English. " +
  "Stay grounded in the skill body and the provided references; do not invent " +
  "APIs or behavior. Prefer concrete, copy-paste-ready guidance.";

const MODE_INSTRUCTIONS: Record<AdviseMode, string> = {
  explain:
    "Explain what this skill does, when to use it, and when to avoid it. " +
    "Be specific. Reference the existing body rather than restating it.",
  integrate:
    "Show how to wire this skill into the existing repo. Identify the files, " +
    "settings, and commands that already exist, and describe the smallest " +
    "change that adds the skill to the user-facing flow.",
  examples:
    "Produce two or three example invocations or scenarios that demonstrate " +
    "the skill's value. Each example must be runnable as written.",
  improve:
    "Find concrete weaknesses in the skill body: missing inputs, broken " +
    "promises, unclear copy, missing tests. Suggest the smallest change for " +
    "each finding.",
};

function renderSection(title: string, sections: AdviseContextSection[]): string {
  if (sections.length === 0) return `## ${title}\n(none)`;
  const lines = [`## ${title}`];
  for (const s of sections) {
    lines.push(`### ${s.name}`);
    lines.push(s.content);
    lines.push("");
  }
  return lines.join("\n");
}

export function buildPrompt(mode: AdviseMode, input: AdvisePromptInput): AdvisePrompt {
  const lines: string[] = [];
  lines.push(`# Skill: ${input.skillName}`);
  lines.push("");
  lines.push("## Body");
  lines.push(input.body);
  lines.push("");
  lines.push(renderSection("References", input.references));
  lines.push("");
  lines.push(renderSection("Upstream wiki (context only)", input.wiki));
  lines.push("");
  lines.push("## Task");
  lines.push(MODE_INSTRUCTIONS[mode]);

  return {
    system: SYSTEM_BASE,
    user: lines.join("\n"),
  };
}
