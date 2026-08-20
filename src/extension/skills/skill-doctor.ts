/**
 * Skill health table for `/skills doctor`.
 * Rows only — no essay. Overlay chrome matches `/powerline doctor`.
 */

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { copyToClipboard } from "@earendil-works/pi-coding-agent";
import type { SelectItem } from "@earendil-works/pi-tui";

import { showSelectOverlay } from "../ui/overlay-chrome.ts";
import {
  getSkillUsage,
  invalidateSkillCache,
  loadSkillCatalog,
  type SkillEntry,
  type SkillUsage,
} from "./skill-registry.ts";

/** Prompt-budget cap for skill descriptions (stricter than core's 1024). */
export const SKILL_DESCRIPTION_MAX_CHARS = 240;

export type SkillDoctorStatus = "ok" | "warn" | "fail";

export type SkillDoctorIssue =
  | "unclosed-frontmatter"
  | "missing-frontmatter"
  | "missing-description"
  | "description-budget"
  | "duplicate-global-project"
  | "unused"
  | "warning"
  | "none";

export interface SkillDoctorRow {
  status: SkillDoctorStatus;
  skill: string;
  issue: SkillDoctorIssue;
  detail: string;
}

const ISSUE_LABEL: Record<SkillDoctorIssue, string> = {
  "unclosed-frontmatter": "unclosed frontmatter",
  "missing-frontmatter": "missing frontmatter",
  "missing-description": "missing description",
  "description-budget": "description over budget",
  "duplicate-global-project": "duplicate global/project",
  unused: "unused",
  warning: "warning",
  none: "no issues",
};

export function hasUnclosedFrontmatter(content: string): boolean {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") return false;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === "---") return false;
  }
  return true;
}

export function hasClosedFrontmatter(content: string): boolean {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") return false;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === "---") return true;
  }
  return false;
}

function isLoosePromptOrExtraFile(entry: SkillEntry): boolean {
  return (
    (entry.category === "prompts" || entry.category === "extra") &&
    basename(entry.filePath) !== "SKILL.md" &&
    !entry.isDirectorySkill
  );
}

function pushRow(
  rows: SkillDoctorRow[],
  skill: string,
  status: SkillDoctorStatus,
  issue: SkillDoctorIssue,
  detail: string,
): void {
  rows.push({ status, skill, issue, detail });
}

/**
 * Pure table builder. `contents` is optional file text keyed by `filePath`
 * so unclosed-frontmatter can be detected without the filesystem.
 */
export function diagnoseSkills(
  entries: readonly SkillEntry[],
  usage: ReadonlyMap<string, SkillUsage>,
  contents: ReadonlyMap<string, string> = new Map(),
): SkillDoctorRow[] {
  const rows: SkillDoctorRow[] = [];

  const byName = new Map<string, SkillEntry[]>();
  for (const entry of entries) {
    const key = entry.name.toLowerCase();
    const list = byName.get(key) ?? [];
    list.push(entry);
    byName.set(key, list);
  }

  const duplicateNames = new Set<string>();
  for (const [name, group] of byName) {
    const cats = new Set(group.map((e) => e.category));
    if (cats.has("global") && cats.has("project")) duplicateNames.add(name);
  }

  for (const entry of entries) {
    const content = contents.get(entry.filePath);
    const description = entry.description.trim();
    let hadFail = false;
    if (content !== undefined && hasUnclosedFrontmatter(content)) {
      hadFail = true;
      pushRow(
        rows,
        entry.name,
        "fail",
        "unclosed-frontmatter",
        `${entry.category} · ${entry.filePath}`,
      );
    } else if (
      content !== undefined &&
      !hasClosedFrontmatter(content) &&
      !isLoosePromptOrExtraFile(entry)
    ) {
      hadFail = true;
      pushRow(
        rows,
        entry.name,
        "fail",
        "missing-frontmatter",
        `${entry.category} · ${entry.filePath}`,
      );
    }

    if (!hadFail && !description) {
      hadFail = true;
      pushRow(
        rows,
        entry.name,
        "fail",
        "missing-description",
        `${entry.category} · model will not see this skill`,
      );
    } else if (!hadFail && description.length > SKILL_DESCRIPTION_MAX_CHARS) {
      pushRow(
        rows,
        entry.name,
        "warn",
        "description-budget",
        `${description.length}/${SKILL_DESCRIPTION_MAX_CHARS} chars`,
      );
    }

    if (duplicateNames.has(entry.name.toLowerCase())) {
      pushRow(
        rows,
        entry.name,
        "warn",
        "duplicate-global-project",
        "same name in global and project",
      );
    }

    const count = usage.get(entry.name)?.count ?? 0;
    if (count === 0) {
      pushRow(rows, entry.name, "warn", "unused", "usage ledger count 0");
    }

    if (entry.warning && !hadFail) {
      pushRow(rows, entry.name, "warn", "warning", entry.warning);
    }
  }

  const rank: Record<SkillDoctorStatus, number> = { fail: 0, warn: 1, ok: 2 };
  rows.sort((a, b) => {
    const s = rank[a.status] - rank[b.status];
    if (s !== 0) return s;
    const n = a.skill.localeCompare(b.skill);
    if (n !== 0) return n;
    return a.issue.localeCompare(b.issue);
  });

  if (rows.length === 0) {
    return [
      {
        status: "ok",
        skill: "catalog",
        issue: "none",
        detail: "no issues",
      },
    ];
  }
  return rows;
}

export function formatSkillDoctorRow(row: SkillDoctorRow): string {
  const tag =
    row.status === "ok" ? "[ok]  " : row.status === "warn" ? "[warn]" : "[fail]";
  if (row.issue === "none") {
    return `${tag} catalog · no issues`;
  }
  return `${tag} ${row.skill} · ${ISSUE_LABEL[row.issue]}`;
}

export function skillDoctorRowsToSelectItems(
  rows: readonly SkillDoctorRow[],
): SelectItem[] {
  return rows.map((row) => ({
    label: formatSkillDoctorRow(row),
    value: `${row.skill}: ${row.detail}`,
    description: row.detail,
  }));
}

/** Build doctor rows and file contents for a cwd (testable without overlay). */
export function collectSkillDoctorInputs(cwd: string = process.cwd()): {
  entries: SkillEntry[];
  usage: Map<string, SkillUsage>;
  contents: Map<string, string>;
} {
  invalidateSkillCache();
  const entries = loadSkillCatalog(cwd);
  const usage = getSkillUsage();
  const contents = new Map<string, string>();
  for (const entry of entries) {
    try {
      contents.set(entry.filePath, readFileSync(entry.filePath, "utf8"));
    } catch {
      // unreadables already surface as registry warnings
    }
  }
  return { entries, usage, contents };
}

/** Overlay table. Enter copies the selected line. */
export async function runSkillDoctor(ctx: any): Promise<void> {
  const cwd = ctx.cwd ?? process.cwd();
  const { entries, usage, contents } = collectSkillDoctorInputs(cwd);
  const items = skillDoctorRowsToSelectItems(
    diagnoseSkills(entries, usage, contents),
  );
  const picked = await showSelectOverlay(
    ctx,
    "Skills doctor",
    "↑↓ navigate · enter copy · esc close",
    items,
    Math.min(Math.max(items.length, 1), 20),
  );
  if (!picked) return;
  try {
    await copyToClipboard(picked.value);
    ctx.ui.notify("Skill doctor row copied to clipboard", "info");
  } catch {
    ctx.ui.notify("Could not copy skill doctor row to clipboard", "warning");
  }
}
