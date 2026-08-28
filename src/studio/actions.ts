/**
 * Studio action executor (U7). Wires the existing skill backend
 * (templates, doctor) into a single action runner the Studio action pane
 * calls. Destructive paths (overwrite) route through the supplied
 * `confirm` callback so the action pane can render the same
 * confirm step it already shows for delete/overwrite elsewhere.
 */

import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  SkillNameError,
  isSkillTemplateId,
  writeSkillFromTemplate,
  type SkillTemplateId,
} from "../extension/skills/skill-templates.ts";
import { collectSkillDoctorInputs, diagnoseSkills } from "../extension/skills/skill-doctor.ts";

export type StudioAction =
  | {
      type: "create";
      name: string;
      template: SkillTemplateId;
      skillsRoot: string;
    }
  | {
      type: "doctor";
      cwd: string;
    };

export interface ActionContext {
  confirm: (message: string) => Promise<boolean>;
}

export type ActionResultKind = "ok" | "error" | "declined";

export interface ActionResult {
  kind: ActionResultKind;
  message: string;
  filePath?: string;
}

export async function runStudioAction(
  action: StudioAction,
  ctx: ActionContext,
): Promise<ActionResult> {
  if (action.type === "create") {
    return runCreate(action, ctx);
  }
  if (action.type === "doctor") {
    return runDoctor(action);
  }
  return { kind: "error", message: `Unknown action` };
}

async function runCreate(
  action: Extract<StudioAction, { type: "create" }>,
  ctx: ActionContext,
): Promise<ActionResult> {
  const safe = action.name.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  if (!safe || safe === "-" || safe.includes("..")) {
    return { kind: "error", message: `Invalid skill name: ${action.name}` };
  }
  const filePath = join(action.skillsRoot, safe, "SKILL.md");
  if (existsSync(filePath)) {
    const ok = await ctx.confirm(`Skill "${safe}" exists. Overwrite?`);
    if (!ok) {
      return { kind: "declined", message: `Cancelled: ${safe} unchanged`, filePath };
    }
    try {
      rmSync(filePath, { force: true });
      writeSkillFromTemplate(safe, action.template, action.skillsRoot);
      return { kind: "ok", message: `Overwrote ${safe}`, filePath };
    } catch (err) {
      return { kind: "error", message: errorMessage(err) };
    }
  }
  try {
    writeSkillFromTemplate(safe, action.template, action.skillsRoot);
    return { kind: "ok", message: `Created ${safe}`, filePath };
  } catch (err) {
    return { kind: "error", message: errorMessage(err) };
  }
}

function runDoctor(action: Extract<StudioAction, { type: "doctor" }>): ActionResult {
  const { entries, usage, contents } = collectSkillDoctorInputs(action.cwd);
  const rows = diagnoseSkills(entries, usage, contents);
  const ok = rows.filter((r) => r.status === "ok").length;
  const warn = rows.filter((r) => r.status === "warn").length;
  const fail = rows.filter((r) => r.status === "fail").length;
  return {
    kind: "ok",
    message: `Doctor: ${rows.length} skills · ${ok} ok · ${warn} warn · ${fail} fail`,
  };
}

function errorMessage(err: unknown): string {
  if (err instanceof SkillNameError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
