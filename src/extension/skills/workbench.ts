/**
 * Skill workbench: split-pane list + metadata + health + sparkline + preview,
 * plus an inline new-skill wizard and workflow visualization.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import {
  SKILL_TEMPLATE_IDS,
  isSkillTemplateId,
  renderSkillTemplate,
  sanitizeSkillName,
  type SkillTemplateId,
} from "./skill-templates.ts";
import type { SkillDoctorStatus } from "./skill-doctor.ts";

export interface WorkbenchSkill {
  name: string;
  description: string;
  category: string;
  warning?: string;
  usageCount: number;
  usageSeries?: number[];
  health?: SkillDoctorStatus;
  bodyPreview?: string;
  triggers?: string[];
  filePath?: string;
}

export const WIZARD_STEPS = [
  "name",
  "description",
  "template",
  "triggers",
  "confirm",
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number];

export interface SkillWizardState {
  step: WizardStep;
  name: string;
  description: string;
  template: SkillTemplateId;
  triggers: string;
  error: string | null;
}

export function createSkillWizard(): SkillWizardState {
  return {
    step: "name",
    name: "",
    description: "",
    template: "standard",
    triggers: "",
    error: null,
  };
}

export function wizardStepIndex(step: WizardStep): number {
  return WIZARD_STEPS.indexOf(step);
}

export function applyWizardInput(state: SkillWizardState, data: string): SkillWizardState {
  if (data === "escape" || data === "\x1b") {
    return state;
  }
  if (data === "backspace" || data === "\x7f" || data === "\b") {
    return editWizardField(state, (value) => value.slice(0, -1));
  }
  if (data === "tab" || data === "enter" || data === "\r" || data === "\n") {
    return advanceWizard(state);
  }
  if (data.length === 1 && data >= " " && data <= "~") {
    return editWizardField(state, (value) => value + data);
  }
  return state;
}

function editWizardField(
  state: SkillWizardState,
  edit: (value: string) => string,
): SkillWizardState {
  switch (state.step) {
    case "name":
      return { ...state, name: edit(state.name), error: null };
    case "description":
      return { ...state, description: edit(state.description), error: null };
    case "triggers":
      return { ...state, triggers: edit(state.triggers), error: null };
    case "template": {
      const next = edit(state.template).trim();
      return {
        ...state,
        template: isSkillTemplateId(next) ? next : state.template,
        error: null,
      };
    }
    case "confirm":
      return state;
  }
}

export function cycleWizardTemplate(state: SkillWizardState, direction = 1): SkillWizardState {
  const index = SKILL_TEMPLATE_IDS.indexOf(state.template);
  const next = SKILL_TEMPLATE_IDS[(index + direction + SKILL_TEMPLATE_IDS.length) % SKILL_TEMPLATE_IDS.length]!;
  return { ...state, template: next, error: null };
}

export function advanceWizard(state: SkillWizardState): SkillWizardState {
  if (state.step === "name") {
    try {
      const name = sanitizeSkillName(state.name);
      return { ...state, name, error: null, step: "description" };
    } catch (error) {
      return {
        ...state,
        error: error instanceof Error ? error.message : "Invalid skill name",
      };
    }
  }
  if (state.step === "description") {
    if (!state.description.trim()) {
      return { ...state, error: "Description is required" };
    }
    return { ...state, step: "template", error: null };
  }
  if (state.step === "template") {
    return { ...state, step: "triggers", error: null };
  }
  if (state.step === "triggers") {
    return { ...state, step: "confirm", error: null };
  }
  return state;
}

export function retreatWizard(state: SkillWizardState): SkillWizardState {
  const index = wizardStepIndex(state.step);
  if (index <= 0) return state;
  return { ...state, step: WIZARD_STEPS[index - 1]!, error: null };
}

export function wizardIsComplete(state: SkillWizardState): boolean {
  return state.step === "confirm" && !state.error && Boolean(state.name);
}

export function parseSkillTriggers(name: string, body: string): string[] {
  const listed: string[] = [];
  const heading = body.match(/## Triggers\s*\n+([\s\S]*?)(?=\n## |\s*$)/i);
  if (heading) {
    for (const line of heading[1].split("\n")) {
      const item = line.replace(/^\s*[-*]\s+/, "").trim();
      if (item) listed.push(item);
    }
  }
  return listed.length > 0 ? listed : [name, `$${name}`];
}

export function composeWizardSkill(state: SkillWizardState): string {
  const name = sanitizeSkillName(state.name);
  const body = renderSkillTemplate(state.template, name);
  const triggers = state.triggers
    .split(/[,]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const triggerBlock =
    triggers.length > 0
      ? `\n## Triggers\n\n${triggers.map((item) => `- ${item}`).join("\n")}\n`
      : "";
  if (!state.description.trim()) return `${body}${triggerBlock}`;
  return body.replace(
    /description: .*/,
    `description: ${state.description.trim()}`,
  ) + triggerBlock;
}

export function renderUsageSparkline(counts: number[], width = 12): string {
  const blocks = [" ", "▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  if (width <= 0) return "";
  if (counts.length === 0) return "·".repeat(width);
  const series =
    counts.length >= width
      ? counts.slice(counts.length - width)
      : [...Array(width - counts.length).fill(0), ...counts];
  const max = Math.max(1, ...series);
  return series
    .map((value) => {
      const index = Math.round((value / max) * (blocks.length - 1));
      return blocks[index] ?? " ";
    })
    .join("");
}

export function renderSkillWorkflow(skill: WorkbenchSkill): string[] {
  const health = skill.health ?? (skill.warning ? "warn" : "ok");
  const triggers = skill.triggers?.length ? skill.triggers.join(", ") : "name / $skill";
  return [
    `discover(${skill.category}) → health(${health}) → usage(${skill.usageCount}x) → insert`,
    `triggers: ${triggers}`,
  ];
}

export function renderSkillWizard(theme: Theme, width: number, state: SkillWizardState): string[] {
  const title = theme.fg("accent", `NEW SKILL WIZARD · step ${wizardStepIndex(state.step) + 1}/${WIZARD_STEPS.length}`);
  const lines = [
    title,
    `Name: ${state.name || "…"}`,
    `Description: ${state.description || "…"}`,
    `Template: ${state.template}`,
    `Triggers: ${state.triggers || "(none)"}`,
    "",
    `Editing: ${state.step}`,
  ];
  if (state.error) lines.push(theme.fg("warning", state.error));
  if (state.step === "confirm") {
    lines.push("Enter saves · esc cancels");
    lines.push(...composeWizardSkill(state).split("\n").slice(0, 6));
  } else {
    lines.push("type · enter next · tab next · backspace edit");
  }
  return lines.map((line) => truncateToWidth(line, width, "…", true));
}

export function renderSkillWorkbench(
  theme: Theme,
  width: number,
  skills: readonly WorkbenchSkill[],
  selected: number,
  wizard: SkillWizardState | null,
): string[] {
  if (wizard) return renderSkillWizard(theme, width, wizard);
  if (skills.length === 0) {
    return [
      theme.fg("warning", "No skills installed"),
      "Press n or ctrl+n to open the new-skill wizard",
    ].map((line) => truncateToWidth(line, width, "…", true));
  }

  const index = Math.max(0, Math.min(selected, skills.length - 1));
  const skill = skills[index]!;
  const leftW = Math.max(12, Math.floor(width * 0.32));
  const midW = Math.max(16, Math.floor(width * 0.36));
  const rightW = Math.max(12, width - leftW - midW - 2);
  const windowSize = 8;
  const start = Math.max(
    0,
    Math.min(index - Math.floor(windowSize / 2), Math.max(0, skills.length - windowSize)),
  );
  const visible = skills.slice(start, start + windowSize);

  const list = [
    theme.fg(
      "accent",
      skills.length > windowSize ? `SKILLS ${index + 1}/${skills.length}` : "SKILLS",
    ),
    ...visible.map((entry, i) => {
      const actual = start + i;
      const marker = actual === index ? "→" : " ";
      const warn = entry.warning ? " !" : "";
      return `${marker} ${entry.name}${warn}`;
    }),
  ];
  const meta = [
    theme.fg("accent", "METADATA"),
    skill.name,
    skill.description || "(no description)",
    `health: ${skill.health ?? (skill.warning ? "warn" : "ok")}`,
    `usage: ${skill.usageCount}x  ${renderUsageSparkline(skill.usageSeries ?? [skill.usageCount])}`,
    ...renderSkillWorkflow(skill),
  ];
  const preview = [
    theme.fg("accent", "PREVIEW"),
    ...(skill.bodyPreview || "(empty body)").split("\n").slice(0, 6),
  ];

  const rows = Math.max(list.length, meta.length, preview.length);
  const lines: string[] = [];
  for (let i = 0; i < rows; i++) {
    const left = padPlain(list[i] ?? "", leftW);
    const mid = padPlain(meta[i] ?? "", midW);
    const right = padPlain(preview[i] ?? "", rightW);
    lines.push(truncateToWidth(`${left} ${mid} ${right}`, width, "…", true));
  }
  lines.push(truncateToWidth("n new skill · ↑↓ select · enter insert", width, "…", true));
  return lines;
}

function padPlain(text: string, width: number): string {
  const plain = text.replace(/\x1b\[[0-9;]*m/g, "");
  if (plain.length >= width) return truncateToWidth(text, width, "…", true);
  return text + " ".repeat(width - plain.length);
}
