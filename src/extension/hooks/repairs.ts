/**
 * repairs.ts
 * ---------------------------------------------------------------------------
 * Tool-input repairs vóór executie (pi's `tool_call` event heeft mutable
 * input). Custom/extension tools only. Order is fixed: json-parse before
 * bare-string wrap so `'["a"]'` becomes `["a"]`, not `[['["a"]']]`.
 * ---------------------------------------------------------------------------
 */

/** Degenerate markdown auto-link: link-tekst == url zonder protocol. */
const AUTO_LINK_RE = /^\[([^\]\s]+)\]\((https?:\/\/|file:\/\/)?([^)\s]*)\)$/;

const CORE_TOOLS = new Set([
  "bash",
  "read",
  "edit",
  "write",
  "grep",
  "find",
  "ls",
]);

const PATH_ALIASES = ["filePath", "absolutePath", "target_file", "file_path"];

const ARRAY_KEYS = new Set([
  "files",
  "paths",
  "globs",
  "args",
  "items",
  "patterns",
  "include",
  "exclude",
  "queries",
  "urls",
  "commands",
]);

function isDegenerateAutoLink(linkText: string, url: string): boolean {
  return linkText === url || linkText === decodeURI(url);
}

function isArrayKey(key: string): boolean {
  if (ARRAY_KEYS.has(key)) return true;
  return /_(files|paths|globs|args|items|patterns)$/.test(key);
}

function looksLikePath(text: string): boolean {
  if (/\s/.test(text)) return false;
  return text.includes("/") || text.includes(".") || /^[a-zA-Z0-9_-]+$/.test(text);
}

function parseJsonArray(value: string): unknown[] | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[")) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isEmptyObject(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value as Record<string, unknown>).length === 0
  );
}

export interface RepairResult {
  toolName: string;
  repairs: string[];
}

/**
 * Repareer een tool-input in place. Retourneert de toegepaste reparaties
 * (leeg = niets gedaan). Geldt alleen voor custom tools van extensies;
 * pi core tools valideren hun eigen schema.
 */
export function repairToolInput(
  toolName: string,
  input: Record<string, unknown>,
): RepairResult {
  const repairs: string[] = [];
  if (CORE_TOOLS.has(toolName) || !input || typeof input !== "object") {
    return { toolName, repairs };
  }

  if (typeof input.path !== "string" || !input.path) {
    for (const alias of PATH_ALIASES) {
      const value = input[alias];
      if (typeof value === "string" && looksLikePath(value)) {
        input.path = value;
        delete input[alias];
        repairs.push(`path-alias:${alias}`);
        break;
      }
    }
  }

  for (const key of Object.keys(input)) {
    const value = input[key];
    if (value === null) {
      delete input[key];
      repairs.push(`null-for-optional:${key}`);
      continue;
    }
    if (typeof value === "string") {
      const m = AUTO_LINK_RE.exec(value);
      if (m && m[1] && isDegenerateAutoLink(m[1], m[3] ?? "")) {
        input[key] = m[1];
        repairs.push(`auto-link-unwrap:${key}`);
      }
      const current = input[key];
      if (typeof current === "string") {
        const parsed = parseJsonArray(current);
        if (parsed) {
          input[key] = parsed;
          repairs.push(`json-string-array:${key}`);
        }
      }
    }
    const afterParse = input[key];
    if (isArrayKey(key) && isEmptyObject(afterParse)) {
      input[key] = [];
      repairs.push(`empty-object-placeholder:${key}`);
      continue;
    }
    if (isArrayKey(key) && typeof afterParse === "string") {
      input[key] = [afterParse];
      repairs.push(`bare-string-wrap:${key}`);
    }
  }
  return { toolName, repairs };
}

/** Repair-teller per (tool, repair) — zichtbaar via /repairs. */
const repairCounts = new Map<string, number>();

export function recordRepairs(result: RepairResult): void {
  for (const r of result.repairs) {
    const key = `${result.toolName}:${r.split(":")[0]}`;
    repairCounts.set(key, (repairCounts.get(key) ?? 0) + 1);
  }
}

export function getRepairCounts(): Map<string, number> {
  return new Map(repairCounts);
}
