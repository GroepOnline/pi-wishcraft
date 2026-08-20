/**
 * skill-registry.ts
 * ---------------------------------------------------------------------------
 * Data-laag voor de skills manager v2: discovery via pi core's eigen
 * `loadSkills()` (recursieve SKILL.md-discovery, loose .md children,
 * SourceInfo, diagnostics) plus rijke metadata per skill en een
 * usage-ledger. Cache met TTL + expliciete invalidatie (session_start,
 * manager-open) zodat nieuwe skills zonder herstart zichtbaar worden.
 * ---------------------------------------------------------------------------
 */

import { loadSkills } from "@earendil-works/pi-coding-agent";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { getAgentDir, getAgentPath } from "../../paths/agent-dirs.ts";
import { parseSkillFrontmatter, stripFrontmatter } from "../../core/frontmatter.ts";

/** Categorie: waar de skill vandaan komt. */
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
  /** Alleen true voor core skills die een eigen skill-directory bezitten. */
  isDirectorySkill?: boolean;
  category: SkillCategory;
  disableModelInvocation: boolean;
  sizeBytes: number;
  lineCount: number;
  mtimeMs: number;
  /** Alle frontmatter-keys (raw, inclusief onbekende). */
  frontmatterKeys: string[];
  /** Diagnostische melding (core diagnostics, of lege description). */
  warning?: string;
}

/** Losse .md/.txt in extra-dirs (prompts/legacy) die core weigert (geen
 * frontmatter-description). Core-dirs houden core's strenge regels; alleen
 * de extra dirs krijgen deze lakse fallback zodat oude prompts blijven werken. */
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
        warning: "geen description — model ziet deze skill niet in de prompt",
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
let cachedCwd: string | null = null;
let onCacheInvalidated: (() => void) | null = null;

export function setSkillCacheInvalidationHandler(handler: (() => void) | null): void {
  onCacheInvalidated = handler;
}

const usageCache = new Map<string, SkillUsage>();
let usageLoaded = false;

/** Verwijder de discovery-cache (volgende leesactie scant opnieuw). */
export function invalidateSkillCache(): void {
  cachedAt = 0;
  cachedEntries = null;
  cachedPathMap = null;
  cachedCwd = null;
  onCacheInvalidated?.();
}

/** Legacy prompts/loose-md dirs die inline-invocation altijd al scanden. */
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

/** Parse alle top-level frontmatter-keys (naam + waarde-indicator niet nodig). */
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
      warning = "bestand niet leesbaar";
    }
    if (!warning && !s.description.trim()) {
      warning = "geen description — model ziet deze skill niet in de prompt";
    }
    if (!warning && s.filePath && diagByPath.has(s.filePath)) {
      warning = diagByPath.get(s.filePath);
    }
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
      warning,
    };
  });

  // loose entries achteraan; bij naam-collisie wint core
  const looseNames = new Set(loose.map((e) => e.name));
  const catalogPaths = new Set([
    ...entries.map((e) => e.filePath),
    ...loose.map((e) => e.filePath),
  ]);
  const rejected = buildRejectedSkillEntries(
    result.diagnostics,
    catalogPaths,
    cwd,
    extras,
  );
  cachedAt = now;
  cachedCwd = cwd;
  cachedEntries = [
    ...entries.filter((e) => !looseNames.has(e.name)),
    ...loose,
    ...rejected,
  ].sort((a, b) => a.name.localeCompare(b.name));
  cachedPathMap = new Map(cachedEntries.map((e) => [e.name, e.filePath] as const));
  return cachedEntries;
}

/** Compat: naam → bestandspad (voor inline-invocation). */
export function getAvailableSkills(): Map<string, string> {
  loadSkillCatalog();
  return cachedPathMap ?? new Map();
}

// ---------------------------------------------------------------------------
// Usage-ledger (~/.pi/agent/skill-usage.json)
// ---------------------------------------------------------------------------

function usageFile(): string {
  return getAgentPath("skill-usage.json");
}

function loadUsage(): void {
  if (usageLoaded) return;
  usageLoaded = true;
  try {
    const raw = readFileSync(usageFile(), "utf8");
    const parsed = JSON.parse(raw) as Record<string, SkillUsage>;
    for (const [name, u] of Object.entries(parsed)) {
      usageCache.set(name, { count: u.count ?? 0, lastUsed: u.lastUsed ?? 0 });
    }
  } catch {
    // geen bestand of kapot JSON → lege ledger
  }
}

/** Usage voor alle skills (naam → {count, lastUsed}). */
export function getSkillUsage(): Map<string, SkillUsage> {
  loadUsage();
  return usageCache;
}

let usageFlushTimer: ReturnType<typeof setTimeout> | null = null;
let exitFlushRegistered = false;

/** Schrijf de ledger nu naar schijf (best-effort, sync). */
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
    // best-effort: tracking mag de hot path nooit breken
  }
}

/**
 * Log een skill-gebruik. De in-memory ledger wordt meteen bijgewerkt (zodat
 * getSkillUsage() klopt), maar de schijf-write wordt gedebounced zodat de
 * input hot path niet per keystroke een sync writeFileSync doet.
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

/** Compat-export: catalogus als ouderwets SkillInfo[] (manager v1 API). */
export function listSkills(): { name: string; description: string; path: string; source: string }[] {
  return loadSkillCatalog().map((e) => ({
    name: e.name,
    description: e.description,
    path: e.filePath,
    source: e.category,
  }));
}

/** Pure filter/sorteer-logica voor de manager-lijst (testbaar zonder TUI). */
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
