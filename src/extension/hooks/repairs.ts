/**
 * repairs.ts
 * ---------------------------------------------------------------------------
 * Tool-input repairs vóór executie (pi's `tool_call` event heeft mutable
 * input). Alleen de reparaties die zonder schema-kennis universeel veilig
 * zijn; schema-afhankelijke repairs (bare-string-wrap, JSON-string-array,
 * placeholder-object) vereisen de validator-issue-lijst en blijven bewust
 * weg tot Pi die expose't.
 * ---------------------------------------------------------------------------
 */

/** Degenerate markdown auto-link: link-tekst == url zonder protocol. */
const AUTO_LINK_RE = /^\[([^\]\s]+)\]\((https?:\/\/|file:\/\/)?([^)\s]*)\)$/;

function isDegenerateAutoLink(linkText: string, url: string): boolean {
  return linkText === url || linkText === decodeURI(url);
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
  const isBuiltin = ["bash", "read", "edit", "write", "grep", "find", "ls"].includes(
    toolName,
  );
  if (isBuiltin || !input || typeof input !== "object") {
    return { toolName, repairs };
  }

  for (const key of Object.keys(input)) {
    const value = input[key];
    // null-for-optional: model stuurde null, schema wil afwezig
    if (value === null) {
      delete input[key];
      repairs.push(`null-for-optional:${key}`);
      continue;
    }
    // markdown auto-link op pad-achtige velden: [x.md](http://x.md) → x.md
    if (typeof value === "string") {
      const m = AUTO_LINK_RE.exec(value);
      if (m && m[1] && isDegenerateAutoLink(m[1], m[3] ?? "")) {
        input[key] = m[1];
        repairs.push(`auto-link-unwrap:${key}`);
      }
    }
  }
  return { toolName, repairs };
}

function looksLikePath(text: string): boolean {
  if (/\s/.test(text)) return false;
  return text.includes("/") || text.includes(".") || /^[a-zA-Z0-9_-]+$/.test(text);
}
void looksLikePath;

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
