export interface ReadToolInput {
  offset?: number;
  limit?: number;
}

export interface ReadHintDetails {
  truncation?: {
    totalLines?: number;
    outputLines?: number;
  };
}

const CORE_RANGE_SUMMARY =
  /\[Showing lines \d+|\bUse offset=\d+|\d+ more lines in file|\d+ lines, showing \d+[–-]\d+/i;

/** True when core read output already carries an offset/range continuation line. */
export function coreReadResultHasRangeSummary(
  text: string,
  _details?: ReadHintDetails,
): boolean {
  return CORE_RANGE_SUMMARY.test(text);
}

function countContentLines(text: string): number {
  const lines = text.split("\n");
  let end = lines.length;
  while (end > 0 && lines[end - 1] === "") end--;
  while (end > 0 && /^\[.*\]$/.test(lines[end - 1]!.trim())) end--;
  return end;
}

/** Whether to append a one-line read continuation hint to a core read result. */
export function shouldAppendReadHint(
  input: ReadToolInput | null | undefined,
  text: string,
  details?: ReadHintDetails,
): boolean {
  if (!input) return false;
  if (input.offset === undefined && input.limit === undefined) return false;
  if (coreReadResultHasRangeSummary(text, details)) return false;

  const lineCount = countContentLines(text);
  if (lineCount === 0) return false;

  const start = input.offset ?? 1;
  const end = start + lineCount - 1;
  const total = details?.truncation?.totalLines;
  if (total !== undefined && end >= total) return false;
  if (input.limit !== undefined && lineCount < input.limit) return false;

  return true;
}

/** Format the English continuation hint for a partial read window. */
export function formatReadHint(
  input: ReadToolInput,
  text: string,
  details?: ReadHintDetails,
): string {
  const start = input.offset ?? 1;
  const lineCount = countContentLines(text);
  const end = start + lineCount - 1;
  const next = end + 1;
  const total = details?.truncation?.totalLines;
  if (total !== undefined) {
    return `${total} lines, showing ${start}–${end}, next offset ${next}`;
  }
  return `${lineCount} lines, showing ${start}–${end}, next offset ${next}`;
}

export function extractReadToolResultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((block) =>
    block && typeof block === "object" && "text" in block
      ? String((block as { text?: unknown }).text ?? "")
      : "",
  ).join("\n");
}
