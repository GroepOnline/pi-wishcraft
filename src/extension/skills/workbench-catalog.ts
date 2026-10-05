/**
 * Map the skill catalog onto workbench rows (preview, health, sparkline).
 * The usage ledger stores a count, not a histogram, so the series is that count.
 */

import {
  collectSkillDoctorInputs,
  diagnoseSkills,
  type SkillDoctorRow,
} from "./skill-doctor.ts";
import {
  readSkillBody,
  type SkillEntry,
  type SkillUsage,
} from "./skill-registry.ts";
import { parseSkillTriggers, type WorkbenchSkill } from "./workbench.ts";

function usageSeriesOf(usage: SkillUsage | undefined): number[] {
  if (!usage || usage.count <= 0) return [];
  return [usage.count];
}

export function workbenchSkillFromEntry(
  entry: SkillEntry,
  usage: ReadonlyMap<string, SkillUsage>,
  doctorByName?: ReadonlyMap<string, SkillDoctorRow>,
  body = readSkillBody(entry.filePath),
): WorkbenchSkill {
  const used = usage.get(entry.name);
  const row = doctorByName?.get(entry.name);
  return {
    name: entry.name,
    description: entry.description,
    category: entry.category,
    warning: entry.warning,
    usageCount: used?.count ?? 0,
    usageSeries: usageSeriesOf(used),
    health: row?.status ?? (entry.warning ? "warn" : "ok"),
    bodyPreview: body,
    triggers: parseSkillTriggers(entry.name, body),
    filePath: entry.filePath,
  };
}

export function loadWorkbenchSkills(cwd: string = process.cwd()): WorkbenchSkill[] {
  const inputs = collectSkillDoctorInputs(cwd);
  const rank: Record<SkillDoctorRow["status"], number> = { fail: 0, warn: 1, ok: 2 };
  const doctorByName = new Map<string, SkillDoctorRow>();
  for (const row of diagnoseSkills(inputs.entries, inputs.usage, inputs.contents)) {
    const prev = doctorByName.get(row.skill);
    if (!prev || rank[row.status] < rank[prev.status]) doctorByName.set(row.skill, row);
  }
  return inputs.entries.map((entry) =>
    workbenchSkillFromEntry(entry, inputs.usage, doctorByName, inputs.contents.get(entry.filePath)),
  );
}

export function doctorRowsBySkill(rows: readonly SkillDoctorRow[]): Map<string, SkillDoctorRow> {
  return new Map(rows.map((row) => [row.skill, row]));
}
