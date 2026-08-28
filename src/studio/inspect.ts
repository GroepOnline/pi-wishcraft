/**
 * Studio inspect (U6). Resolves the relative `references/` and `scripts/`
 * paths mentioned in a skill body so the detail pane can show them as
 * resolvable links or broken markers. Absolute URLs and external http(s)
 * links are ignored — the studio renders only files inside the skill dir.
 */

import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

const MD_LINK_RE = /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

const RELATIVE_PREFIXES = ["references/", "scripts/"];

function isExternal(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//");
}

export interface ResolvedReference {
  href: string;
  path: string;
  exists: boolean;
}

export function resolveReferences(body: string, baseDir: string): ResolvedReference[] {
  const out: ResolvedReference[] = [];
  for (const match of body.matchAll(MD_LINK_RE)) {
    const href = match[2] ?? "";
    if (!href || isExternal(href) || isAbsolute(href)) continue;
    if (!RELATIVE_PREFIXES.some((p) => href.startsWith(p))) continue;
    const path = resolve(baseDir, href);
    out.push({ href, path, exists: existsSync(path) });
  }
  return out;
}
