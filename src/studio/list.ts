/**
 * Studio list pane (U6). Pure presentation over the existing
 * `loadSkillCatalog()` output: copy fields, attach a short category badge,
 * and provide a substring filter used by the filter mode in studio state.
 */

import type { SkillCategory, SkillEntry } from "../extension/skills/skill-registry.ts";

export interface ListRow {
  name: string;
  description: string;
  badge: string;
  category: SkillCategory;
  filePath: string;
  warning?: string;
  routingCategory?: string;
  routingFamily?: string;
  role?: string | null;
  routerParent?: string | null;
  registryDrift?: boolean;
}

export function badgeForCategory(category: SkillCategory): string {
  switch (category) {
    case "project":
      return "proj";
    case "global":
      return "glob";
    case "prompts":
      return "prm";
    case "extra":
      return "extra";
  }
}

export function buildListRows(entries: readonly SkillEntry[]): ListRow[] {
  return entries.map((entry) => ({
    name: entry.name,
    description: entry.description,
    badge: badgeForCategory(entry.category),
    category: entry.category,
    filePath: entry.filePath,
    warning: entry.warning,
    routingCategory: entry.routingCategory,
    routingFamily: entry.routingFamily,
    role: entry.role,
    routerParent: entry.routerParent,
    registryDrift: entry.registryDrift,
  }));
}

export function filterListRows(rows: readonly ListRow[], query: string): ListRow[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [...rows];
  return rows.filter(
    (row) => row.name.toLowerCase().includes(q) || row.description.toLowerCase().includes(q) || row.routingCategory?.toLowerCase().includes(q) || row.routingFamily?.toLowerCase().includes(q),
  );
}
