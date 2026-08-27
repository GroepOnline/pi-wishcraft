/**
 * Map the skill catalog onto workbench rows (preview, health, sparkline).
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

/** Sparkline series from usage; main tracks count/lastUsed, not a per-use
 *  series, so a used skill renders a single bar. */
function usageSeriesOf(usage?: SkillUsage | null): number[] {
  if (!usage || !(usage.count > 0)) return [];
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
  const doctorByName = new Map(
    diagnoseSkills(inputs.entries, inputs.usage, inputs.contents).map((row) => [
      row.skill,
      row,
    ]),
  );
  return inputs.entries.map((entry) =>
    workbenchSkillFromEntry(entry, inputs.usage, doctorByName),
  );
}

export function doctorRowsBySkill(
  rows: readonly SkillDoctorRow[],
): Map<string, SkillDoctorRow> {
  return new Map(rows.map((row) => [row.skill, row]));
}
