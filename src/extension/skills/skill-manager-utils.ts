/** Shared state and pure helpers for the skill-manager panel lanes. */

import { realpathSync } from "node:fs";
import { join, relative } from "node:path";

import { getAgentDir } from "../../paths/agent-dirs.ts";
import type { SkillCategory, SkillEntry } from "./skill-registry.ts";
import { applySkillFilter } from "./skill-registry.ts";

export const CATEGORY_LABELS: Record<SkillCategory | "all", string> = {
  all: "all",
  global: "global",
  project: "project",
  prompts: "prompts",
  extra: "extra",
};

export const CATEGORY_ORDER: (SkillCategory | "all")[] = [
  "all",
  "global",
  "project",
  "prompts",
  "extra",
];

export const LIST_ROWS = 14;
export const DETAIL_ROWS = 18;

export interface SkillManagerViewState {
  mode: "list" | "detail";
  query: string;
  category: SkillCategory | "all";
  sort: "name" | "usage";
  selected: number;
  detail: SkillEntry | null;
  bodyLines: string[];
  scroll: number;
  confirmDelete: boolean;
}

export function createSkillManagerViewState(): SkillManagerViewState {
  return {
    mode: "list",
    query: "",
    category: "all",
    sort: "name",
    selected: 0,
    detail: null,
    bodyLines: [],
    scroll: 0,
    confirmDelete: false,
  };
}

export function filteredEntries(
  state: SkillManagerViewState,
  entries: SkillEntry[],
  usage: Map<string, { count: number; lastUsed: number }>,
): SkillEntry[] {
  return applySkillFilter(entries, state.query, state.category, state.sort, usage);
}

export function selectedEntry(
  state: SkillManagerViewState,
  entries: SkillEntry[],
  usage: Map<string, { count: number; lastUsed: number }>,
): SkillEntry | null {
  const f = filteredEntries(state, entries, usage);
  return f[state.selected] ?? f[0] ?? null;
}

export function isPrintable(data: string): boolean {
  return data.length === 1 && data >= " " && data <= "~";
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatLastUsed(ms: number): string {
  if (!ms) return "never";
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/** Append text as a new editor line; the user presses enter to run it. */
export function appendToEditor(ctx: any, text: string, notify: string): void {
  const current = ctx.ui.getEditorText?.() ?? "";
  const separator = current && !current.endsWith("\n") ? "\n" : "";
  ctx.ui.setEditorText(`${current}${separator}${text}\n`);
  ctx.ui.notify(notify, "info");
}

/** POSIX single-quote a path so a skill name with shell metacharacters
 * (e.g. `a; curl … | sh` from an untrusted cloned repo) cannot inject. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

/**
 * Resolve `target` through symlinks and confirm it stays within one of the
 * canonical skill roots (agent skills dir, `<cwd>/.pi/skills`, `<cwd>/skills`).
 * Guards the recursive delete against catalog paths that a cloned/untrusted
 * repo could point outside the expected trees. Returns false when the path
 * cannot be resolved (e.g. already removed) so callers fail closed.
 */
export function isContainedInSkillRoots(target: string, cwd: string): boolean {
  const roots = [
    join(getAgentDir(), "skills"),
    join(cwd, ".pi", "skills"),
    join(cwd, "skills"),
  ];
  let real: string;
  try {
    real = realpathSync(target);
  } catch {
    return false;
  }
  return roots.some((root) => {
    let realRoot: string;
    try {
      realRoot = realpathSync(root);
    } catch {
      return false;
    }
    const rel = relative(realRoot, real);
    return rel !== "" && !rel.startsWith("..") && !rel.startsWith("/");
  });
}

/**
 * Only allow a bare, path-like editor invocation (no arguments, no shell
 * metacharacters) so a hostile `EDITOR` value cannot inject into the `!` flow.
 * Falls back to `nvim` when the value is unusable.
 */
export function safeEditor(): string {
  const ed = process.env.EDITOR?.trim();
  return ed && /^[\w./-]+$/.test(ed) ? ed : "nvim";
}

export function editorCommand(path: string): string {
  return `!${safeEditor()} ${shellQuote(path)}`;
}
