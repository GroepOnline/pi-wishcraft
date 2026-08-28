/** DeepWiki repo extraction (U9). Pure, no I/O. */

const GH_URL_RE = /https?:\/\/github\.com\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)(?:\/[\w./-]*)?/g;
const BARE_REPO_RE = /\b([A-Za-z0-9][A-Za-z0-9_-]{0,38})\/([A-Za-z0-9][A-Za-z0-9._-]{0,100})\b/g;

const SKIP_BARE_OWNERS = new Set([
  "https",
  "http",
  "www",
  "localhost",
  "127",
  "0",
  "true",
  "false",
  "node_modules",
  "src",
  "dist",
  "build",
  "test",
  "tests",
  "docs",
  "doc",
]);

const PATH_BEFORE = /^.*\//;
const URL_CONTEXT_BEFORE = /(https?:\/\/[^\s]*|github\.com\/)$/;

export interface RepoRef {
  owner: string;
  repo: string;
}

function isBareMentionLikelyRepo(owner: string, repo: string, body: string, matchIndex: number): boolean {
  if (SKIP_BARE_OWNERS.has(owner.toLowerCase())) return false;
  if (!/^[A-Za-z0-9_-]+$/.test(owner)) return false;
  if (!/^[A-Za-z0-9._-]+$/.test(repo)) return false;
  if (owner.startsWith(".") || repo.startsWith(".")) return false;
  if (owner.includes("..") || repo.includes("..")) return false;
  // Reject matches that look like a file path: the chars just before the
  // match must NOT end with a slash (i.e. "open ./foo/bar.ts" loses because
  // the preceding context contains a slash before "foo").
  const before = body.slice(0, matchIndex);
  if (PATH_BEFORE.test(before) && /\.\//.test(before.slice(-32))) return false;
  // Reject matches that fall inside a URL — the preceding context should
  // not end with the URL prefix that BARE_REPO_RE's looser shape matches
  // against (e.g. "github.com/Earendil-Works" inside an https URL).
  if (URL_CONTEXT_BEFORE.test(before.slice(-64))) return false;
  return true;
}

export function extractRepos(body: string): RepoRef[] {
  const out = new Map<string, RepoRef>();
  for (const match of body.matchAll(GH_URL_RE)) {
    const owner = match[1] ?? "";
    const repo = (match[2] ?? "").replace(/\.git$/, "");
    if (owner && repo) out.set(`${owner}/${repo}`, { owner, repo });
  }
  for (const match of body.matchAll(BARE_REPO_RE)) {
    const owner = match[1] ?? "";
    const repo = match[2] ?? "";
    if (isBareMentionLikelyRepo(owner, repo, body, match.index ?? 0)) {
      out.set(`${owner}/${repo}`, { owner, repo });
    }
  }
  return [...out.values()];
}
