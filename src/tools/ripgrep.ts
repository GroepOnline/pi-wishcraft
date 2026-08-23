import { spawnSync } from "node:child_process";

export interface RipgrepMatch {
  file: string;
  lineNumber: number;
  content: string;
}

export interface RipgrepOptions {
  cwd?: string;
  typeFilter?: string;
  maxResults?: number;
}

export interface RipgrepResult {
  matches: RipgrepMatch[];
  totalCount: number;
  engine: "ripgrep" | "grep-fallback";
  error?: string;
}

/**
 * Execute a ripgrep (or fallback grep) search programmatically for subagent use.
 */
export function searchRipgrep(pattern: string, options: RipgrepOptions = {}): RipgrepResult {
  const cwd = options.cwd ?? process.cwd();
  const maxResults = options.maxResults ?? 50;

  // Try rg first
  try {
    const rgArgs = ["--json", "-m", String(maxResults), "-i"];
    if (options.typeFilter) {
      rgArgs.push("-t", options.typeFilter);
    }
    rgArgs.push(pattern, ".");

    const proc = spawnSync("rg", rgArgs, { cwd, encoding: "utf-8", maxBuffer: 5 * 1024 * 1024 });

    if (proc.status === 0 || proc.status === 1) {
      const matches: RipgrepMatch[] = [];
      const lines = (proc.stdout ?? "").split("\n");

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === "match") {
            const data = parsed.data;
            matches.push({
              file: data.path.text,
              lineNumber: data.line_number,
              content: data.lines.text.trimEnd(),
            });
          }
        } catch {
          // ignore non-json lines
        }
      }

      return {
        matches: matches.slice(0, maxResults),
        totalCount: matches.length,
        engine: "ripgrep",
      };
    }
  } catch {
    // Fallback to standard grep
  }

  // Fallback: standard grep
  try {
    const grepArgs = ["-rn", "-m", String(maxResults), "--exclude-dir=node_modules", "--exclude-dir=.git", pattern, "."];
    const proc = spawnSync("grep", grepArgs, { cwd, encoding: "utf-8", maxBuffer: 5 * 1024 * 1024 });

    const matches: RipgrepMatch[] = [];
    const lines = (proc.stdout ?? "").split("\n");

    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.split(":");
      if (parts.length >= 3) {
        const file = parts[0];
        const lineNumber = parseInt(parts[1], 10);
        const content = parts.slice(2).join(":").trimEnd();
        if (!isNaN(lineNumber)) {
          matches.push({ file, lineNumber, content });
        }
      }
    }

    return {
      matches: matches.slice(0, maxResults),
      totalCount: matches.length,
      engine: "grep-fallback",
    };
  } catch (err) {
    return {
      matches: [],
      totalCount: 0,
      engine: "grep-fallback",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
