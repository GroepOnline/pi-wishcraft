/**
 * skill-registry.ts
 * ---------------------------------------------------------------------------
 * Data layer for skills manager v2: discovery via pi core `loadSkills()`
 * (recursive SKILL.md discovery, loose .md children, SourceInfo,
 * diagnostics) plus rich per-skill metadata and a usage ledger. Cache with
 * TTL + explicit invalidation (session_start, manager-open) so new skills
 * show up without a restart.
 * ---------------------------------------------------------------------------
 */

import { loadSkills } from "@earendil-works/pi-coding-agent";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { getAgentDir, getAgentPath } from "../../paths/agent-dirs.ts";
import { parseSkillFrontmatter, stripFrontmatter } from "../../core/frontmatter.ts";
import { loadGlobalSkillRegistry } from "./global-registry.ts";

/** Category: where the skill came from. */
export type SkillCategory = "global" | "project" | "prompts" | "extra";

export interface SkillUsage {
  count: number;
  lastUsed: number;
}

export interface SkillEntry {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  /** True only for core skills that own a skill directory. */
  isDirectorySkill?: boolean;
  category: SkillCategory;
  disableModelInvocation: boolean;
  sizeBytes: number;
  lineCount: number;
  mtimeMs: number;
  /** All frontmatter keys (raw, including unknown). */
  frontmatterKeys: string[];
  /** Frontmatter trigger value (e.g. /test, /showcase). */
  trigger: string | null;
  /** Machine-side ChefGroep routing metadata when the global registry is installed. */
  routingCategory?: string;
  routingFamily?: string;
  metaSkill?: string | null;
  role?: string | null;
  routerParent?: string | null;
  mounts?: string[];
  registryDrift?: boolean;
  /** Diagnostic message (core diagnostics, or empty description). */
  warning?: string;
}

/** Loose .md/.txt in extra dirs (prompts/legacy) that core rejects (no
 * frontmatter description). Core dirs keep core's strict rules; only extra
 * dirs get this lax fallback so old prompts keep working. */
function scanLooseExtraFiles(
  extras: { path: string; category: SkillCategory }[],
  knownPaths: Set<string>,
): SkillEntry[] {
  const out: SkillEntry[] = [];
  for (const { path: dir, category } of extras) {
    let files: string[];
    try {
      files = readdirSync(dir).filter(
        (f) => (f.endsWith(".md") || f.endsWith(".txt")) && statSync(join(dir, f)).isFile(),
      );
    } catch {
      continue;
    }
    for (const f of files) {
      const filePath = join(dir, f);
      if (knownPaths.has(filePath)) continue;
      let content = "";
      let mtimeMs = 0;
      try {
        content = readFileSync(filePath, "utf8");
        mtimeMs = statSync(filePath).mtimeMs;
      } catch {
        continue;
      }
      const name = f.replace(/\.(md|txt)$/, "");
      out.push({
        name,
        description: "",
        filePath,
        baseDir: dirname(filePath),
          isDirectorySkill: false,
        category,
        disableModelInvocation: false,
        sizeBytes: Buffer.byteLength(content, "utf8"),
        lineCount: content.split("\n").length,
        mtimeMs,
        frontmatterKeys: parseFrontmatterKeys(content),
        trigger: null,
        warning: "no description — the model will not see this skill in the prompt",
      });
      knownPaths.add(filePath);
    }
  }
  return out;
}

const CACHE_TTL_MS = 30_000;

let cachedAt = 0;
let cachedEntries: SkillEntry[] | null = null;
let cachedPathMap: Map<string, string> | null = null;
let cachedTriggerMap: Map<string, string> | null = null;
let cachedCwd: string | null = null;
let onCacheInvalidated: (() => void) | null = null;

export function setSkillCacheInvalidationHandler(handler: (() => void) | null): void {
  onCacheInvalidated = handler;
}

const usageCache = new Map<string, SkillUsage>();
let usageLoaded = false;
let usageLoadedFrom: string | null = null;

/** Drop the discovery cache (the next read scans again). */
export function invalidateSkillCache(): void {
  cachedAt = 0;
  cachedEntries = null;
  cachedPathMap = null;
  cachedTriggerMap = null;
  cachedCwd = null;
  onCacheInvalidated?.();
}

/** Legacy prompts/loose-md dirs that inline-invocation already scanned. */
function extraSkillPaths(cwd: string): { path: string; category: SkillCategory }[] {
  const agent = getAgentDir();
  return [
    { path: join(agent, "prompts"), category: "prompts" },
    { path: join(cwd, ".pi", "prompts"), category: "prompts" },
    { path: join(cwd, "prompts"), category: "prompts" },
    { path: join(cwd, "skills"), category: "project" },
  ].filter((p) => existsSync(p.path)) as { path: string; category: SkillCategory }[];
}

function categorize(
  filePath: string,
  cwd: string,
  extras: { path: string; category: SkillCategory }[],
): SkillCategory {
  const agent = getAgentDir();
  const under = (root: string) => {
    const rel = relative(root, filePath);
    return rel !== "" && !rel.startsWith("..") && !rel.startsWith("/");
  };
  if (under(join(agent, "skills"))) return "global";
  if (under(join(cwd, ".pi", "skills")) || under(join(cwd, "skills")))
    return "project";
  for (const extra of extras) {
    if (under(extra.path)) return extra.category;
  }
  return "extra";
}

/** Parse all top-level frontmatter keys (name only; value is unused). */
function parseFrontmatterKeys(content: string): string[] {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") return [];
  const keys: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === "---") break;
    const m = /^\s*([a-zA-Z0-9_-]+)\s*:/.exec(line);
    if (m && !keys.includes(m[1]!)) keys.push(m[1]!);
  }
  return keys;
}

/** Walk canonical skill trees the same way pi core discovers nested SKILL.md. */
function walkCanonicalSkillMdFiles(dir: string, visit: (filePath: string) => void): void {
  if (!existsSync(dir)) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  const skillMd = entries.find((entry) => entry.isFile() && entry.name === "SKILL.md");
  if (skillMd) {
    visit(join(dir, skillMd.name));
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules") {
      continue;
    }
    walkCanonicalSkillMdFiles(join(dir, entry.name), visit);
  }
}

/** Core rejects these paths (skill: null) but still emits diagnostics — surface them for doctor/manager. */
function buildRejectedSkillEntries(
  diagnostics: { message: string; path?: string }[],
  knownPaths: Set<string>,
  cwd: string,
  extras: { path: string; category: SkillCategory }[],
): SkillEntry[] {
  const byPath = new Map<string, string>();
  for (const d of diagnostics) {
    if (!d.path || knownPaths.has(d.path)) continue;
    if (!byPath.has(d.path)) byPath.set(d.path, d.message);
  }

  const agent = getAgentDir();
  for (const root of [join(agent, "skills"), join(cwd, ".pi", "skills"), join(cwd, "skills")]) {
    walkCanonicalSkillMdFiles(root, (filePath) => {
      if (!knownPaths.has(filePath) && !byPath.has(filePath)) {
        byPath.set(filePath, "skill file not loaded by catalog");
      }
    });
  }

  const out: SkillEntry[] = [];
  for (const [filePath, message] of byPath) {
    let content = "";
    let sizeBytes = 0;
    let lineCount = 0;
    let mtimeMs = 0;
    try {
      content = readFileSync(filePath, "utf8");
      sizeBytes = Buffer.byteLength(content, "utf8");
      lineCount = content.split("\n").length;
      mtimeMs = statSync(filePath).mtimeMs;
    } catch {
      // include unreadable paths so doctor can still report them
    }

    const fm = parseSkillFrontmatter(content);
    const base = basename(filePath);
    const name =
      fm.name ??
      (base === "SKILL.md"
        ? basename(dirname(filePath))
        : base.replace(/\.(md|txt)$/, ""));

    out.push({
      name,
      description: fm.description ?? "",
      filePath,
      baseDir: dirname(filePath),
      isDirectorySkill: base === "SKILL.md",
      category: categorize(filePath, cwd, extras),
      disableModelInvocation: false,
      sizeBytes,
      lineCount,
      mtimeMs,
      frontmatterKeys: parseFrontmatterKeys(content),
      trigger: null,
      warning: message,
    });
    knownPaths.add(filePath);
  }
  return out;
}

/** Bouw de volledige skill-catalogus (gecached, TTL 30s). */
export function loadSkillCatalog(cwd: string = process.cwd()): SkillEntry[] {
  const now = Date.now();
  if (cachedEntries && cachedCwd === cwd && now - cachedAt < CACHE_TTL_MS) return cachedEntries;

  const extras = extraSkillPaths(cwd);
  const result = loadSkills({
    cwd,
    agentDir: getAgentDir(),
    skillPaths: extras.map((e) => e.path),
    includeDefaults: true,
  });
  const diagByPath = new Map<string, string>();
  for (const d of result.diagnostics) {
    if (d.path && !diagByPath.has(d.path)) diagByPath.set(d.path, d.message);
  }
  const knownPaths = new Set(result.skills.map((s) => s.filePath));
  const loose = scanLooseExtraFiles(extras, knownPaths);

  const entries: SkillEntry[] = result.skills.map((s) => {
    let sizeBytes = 0;
    let lineCount = 0;
    let mtimeMs = 0;
    let content = "";
    let warning: string | undefined;
    try {
      content = readFileSync(s.filePath, "utf8");
      sizeBytes = Buffer.byteLength(content, "utf8");
      lineCount = content.split("\n").length;
      mtimeMs = statSync(s.filePath).mtimeMs;
    } catch {
      warning = "file not readable";
    }
    if (!warning && !s.description.trim()) {
      warning = "no description — the model will not see this skill in the prompt";
    }
    if (!warning && s.filePath && diagByPath.has(s.filePath)) {
      warning = diagByPath.get(s.filePath);
    }
    const fm = content ? parseSkillFrontmatter(content) : { name: null, description: null, trigger: null };
    return {
      name: s.name,
      description: s.description,
      filePath: s.filePath,
      baseDir: s.baseDir || dirname(s.filePath),
        isDirectorySkill: Boolean(s.baseDir),
      category: categorize(s.filePath, cwd, extras),
      disableModelInvocation: s.disableModelInvocation,
      sizeBytes,
      lineCount,
      mtimeMs,
      frontmatterKeys: parseFrontmatterKeys(content),
      trigger: fm.trigger ?? null,
      warning,
    };
  });

  // loose entries last; on a name collision core wins
  const looseNames = new Set(loose.map((e) => e.name));
  const catalogPaths = new Set([
    ...entries.map((e) => e.filePath),
    ...loose.map((e) => e.filePath),
  ]);

  // ── Name dedup: prefer project > global > prompts > extra ──
  // When the same skill name appears in multiple roots (e.g. both
  // ~/.pi/agent/skills/test/ and ./.pi/skills/test/), keep only the
  // highest-priority entry so the catalog never shows doubles.
  const NAME_PRIORITY: Record<SkillCategory, number> = {
    project: 0,
    global: 1,
    prompts: 2,
    extra: 3,
  };
  const seen = new Map<string, { prio: number; entry: SkillEntry }>();
  for (const e of entries) {
    const prio = NAME_PRIORITY[e.category] ?? 4;
    const cur = seen.get(e.name);
    if (!cur || prio < cur.prio) seen.set(e.name, { prio, entry: e });
  }
  const deduped = [...seen.values()].map((v) => v.entry);

  const rejected = buildRejectedSkillEntries(
    result.diagnostics,
    catalogPaths,
    cwd,
    extras,
  );
  cachedAt = now;
  cachedCwd = cwd;
  const localEntries = [
    ...deduped.filter((e) => !looseNames.has(e.name)),
    ...loose,
    ...rejected,
  ];

  // Enrich local Pi entries with routing metadata, but do not append
  // registry-only skills here: generic Pi catalog/count semantics stay local.
  const registry = loadGlobalSkillRegistry();
  const registryByName = new Map(registry.map((r) => [r.name, r] as const));
  for (const entry of localEntries) {
    const r = registryByName.get(entry.name);
    if (!r) continue;
    entry.routingCategory = r.category; entry.routingFamily = r.family;
    entry.metaSkill = r.metaSkill; entry.role = r.role; entry.routerParent = r.routerParent;
    entry.mounts = r.mounts; entry.registryDrift = r.drift;
  }
  cachedEntries = localEntries.sort((a, b) => a.name.localeCompare(b.name));
  cachedPathMap = new Map(cachedEntries.map((e) => [e.name, e.filePath] as const));
  cachedTriggerMap = new Map(
    cachedEntries
      .filter((e) => e.trigger !== null)
      .map((e) => [e.trigger!, e.filePath] as const),
  );
  return cachedEntries;
}

/** Full machine-side catalog for Skill Studio only. */
export function loadSkillStudioCatalog(cwd: string = process.cwd()): SkillEntry[] {
  const local = loadSkillCatalog(cwd).map((e) => ({ ...e }));
  const localNames = new Set(local.map((e) => e.name));
  const registryOnly: SkillEntry[] = loadGlobalSkillRegistry()
    .filter((r) => !localNames.has(r.name))
    .map((r) => {
      let sizeBytes = 0, lineCount = 0, mtimeMs = 0;
      let warning: string | undefined;
      try {
        const content = readFileSync(r.filePath, "utf8");
        sizeBytes = Buffer.byteLength(content, "utf8");
        lineCount = content.split("\n").length;
        mtimeMs = statSync(r.filePath).mtimeMs;
      } catch { warning = "registry source not readable on this host"; }
      return {
        name: r.name, description: r.description, filePath: r.filePath, baseDir: dirname(r.filePath),
        isDirectorySkill: basename(r.filePath) === "SKILL.md", category: "extra" as SkillCategory,
        disableModelInvocation: false, sizeBytes, lineCount, mtimeMs, frontmatterKeys: [], trigger: null, warning,
        routingCategory: r.category, routingFamily: r.family, metaSkill: r.metaSkill, role: r.role,
        routerParent: r.routerParent, mounts: r.mounts, registryDrift: r.drift,
      };
    });
  return [...local, ...registryOnly].sort((a, b) => a.name.localeCompare(b.name));
}

/** Compat: name → file path (for inline-invocation $skill). */
export function getAvailableSkills(): Map<string, string> {
  loadSkillCatalog();
  return cachedPathMap ?? new Map();
}

/** Compat: trigger → file path (for inline-invocation /command).
 * Only skills with a `trigger: /command` frontmatter field are returned. */
export function getAvailableCommands(): Map<string, string> {
  loadSkillCatalog();
  return cachedTriggerMap ?? new Map();
}

// ---------------------------------------------------------------------------
// Usage-ledger (~/.pi/agent/skill-usage.json)
// ---------------------------------------------------------------------------

function usageFile(): string {
  return getAgentPath("skill-usage.json");
}

function loadUsage(): void {
  const file = usageFile();
  if (usageLoaded && usageLoadedFrom === file) return;
  usageLoaded = true;
  usageLoadedFrom = file;
  usageCache.clear();
  try {
    const raw = readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as Record<string, SkillUsage>;
    for (const [name, u] of Object.entries(parsed)) {
      usageCache.set(name, { count: u.count ?? 0, lastUsed: u.lastUsed ?? 0 });
    }
  } catch {
    // missing file or broken JSON → empty ledger
  }
}

/** Usage for every skill (name → {count, lastUsed}). */
export function getSkillUsage(): Map<string, SkillUsage> {
  loadUsage();
  return usageCache;
}

let usageFlushTimer: ReturnType<typeof setTimeout> | null = null;
let exitFlushRegistered = false;

/** Write the ledger to disk now (best-effort, sync). */
export function flushSkillUsage(): void {
  if (usageFlushTimer) {
    clearTimeout(usageFlushTimer);
    usageFlushTimer = null;
  }
  try {
    const obj: Record<string, SkillUsage> = {};
    for (const [k, v] of usageCache) obj[k] = v;
    mkdirSync(getAgentDir(), { recursive: true });
    writeFileSync(usageFile(), JSON.stringify(obj, null, 2), "utf8");
  } catch {
    // best-effort: tracking must never break the hot path
  }
}

/**
 * Log a skill use. The in-memory ledger updates immediately (so
 * getSkillUsage() is correct), but the disk write is debounced so the
 * input hot path does not do a sync writeFileSync per keystroke.
 */
export function recordSkillUsage(name: string): void {
  loadUsage();
  const cur = usageCache.get(name) ?? { count: 0, lastUsed: 0 };
  usageCache.set(name, { count: cur.count + 1, lastUsed: Date.now() });

  if (!exitFlushRegistered) {
    exitFlushRegistered = true;
    process.once("exit", () => flushSkillUsage());
  }
  if (!usageFlushTimer) {
    usageFlushTimer = setTimeout(() => {
      usageFlushTimer = null;
      flushSkillUsage();
    }, 500);
    usageFlushTimer.unref?.();
  }
}

/** Lees de skill-body zonder frontmatter. */
export function readSkillBody(path: string): string {
  try {
    return stripFrontmatter(readFileSync(path, "utf8")).trim();
  } catch {
    return "";
  }
}

export function readSkillBodyStrict(path: string): string {
  return stripFrontmatter(readFileSync(path, "utf8")).trim();
}

export function insertSkillBody(
  ctx: any,
  skillName: string,
  body: string,
  appendedText = "",
): void {
  const chunk = appendedText.trim()
    ? `${body.trim()}\n\n${appendedText.trim()}`
    : body.trim();
  const current = ctx.ui.getEditorText?.() ?? "";
  const separator = current && !current.endsWith("\n") ? "\n\n" : "";
  ctx.ui.setEditorText(`${current}${separator}${chunk}\n`);
  recordSkillUsage(skillName);
}

/** Compat-export: catalogus als ouderwets SkillInfo[] (manager v1 API). */
export function listSkills(): { name: string; description: string; path: string; source: string }[] {
  return loadSkillCatalog().map((e) => ({
    name: e.name,
    description: e.description,
    path: e.filePath,
    source: e.category,
  }));
}

/** Pure filter/sort for the manager list (testable without a TUI). */
export function applySkillFilter(
  entries: SkillEntry[],
  query: string,
  category: SkillCategory | "all",
  sort: "name" | "usage",
  usage: Map<string, SkillUsage>,
): SkillEntry[] {
  const q = query.trim().toLowerCase();
  let out = entries.filter((e) => {
    if (category !== "all" && e.category !== category) return false;
    if (!q) return true;
    return (
      e.name.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.filePath.toLowerCase().includes(q)
    );
  });
  if (sort === "usage") {
    out = [...out].sort((a, b) => {
      const ua = usage.get(a.name)?.count ?? 0;
      const ub = usage.get(b.name)?.count ?? 0;
      if (ub !== ua) return ub - ua;
      return a.name.localeCompare(b.name);
    });
  }
  return out;
}
