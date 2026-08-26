import { SETTING_DEFAULTS } from "../../config/settings-registry.ts";
import { readSettings } from "../settings/settings-io.ts";

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

const CORE_SHOWING_LINES =
  /^\[Showing lines \d+[–-]\d+(?: of \d+)?\.(?: Use offset=\d+ to continue\.)?\]$/i;
const CORE_MORE_LINES =
  /^\[?\d+ more lines in file\. Use offset=\d+ to continue\.?\]?$/i;
const OWN_READ_HINT = /^\[wishcraft\] \d+ lines, showing \d+[–-]\d+, next offset \d+$/;

function isCoreRangeFooter(line: string): boolean {
  const footer = line.trim();
  return (
    CORE_SHOWING_LINES.test(footer) ||
    CORE_MORE_LINES.test(footer)
  );
}

function coreFooter(text: string): string {
  const lines = text.split("\n");
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === "") lines.pop();
  return lines[lines.length - 1]?.trim() ?? "";
}

function hasOwnReadHint(text: string): boolean {
  return OWN_READ_HINT.test(coreFooter(text));
}

/** Default on. `wishcraft.readHints: false` is the opt-out. */
export function readHintsEnabled(wishcraftSettings: unknown): boolean {
  if (
    !wishcraftSettings ||
    typeof wishcraftSettings !== "object" ||
    Array.isArray(wishcraftSettings)
  ) {
    return SETTING_DEFAULTS["wishcraft.readHints"];
  }
  const configured = (wishcraftSettings as Record<string, unknown>).readHints;
  return typeof configured === "boolean"
    ? configured
    : SETTING_DEFAULTS["wishcraft.readHints"];
}

/** True when core read output already carries an offset/range continuation line. */
export function coreReadResultHasRangeSummary(
  text: string,
  _details?: ReadHintDetails,
): boolean {
  return isCoreRangeFooter(coreFooter(text));
}

function countContentLines(text: string): number {
  const lines = text.split("\n");
  let end = lines.length;
  while (end > 0 && lines[end - 1] === "") end--;
  if (end > 0 && isCoreRangeFooter(lines[end - 1]!)) end--;
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
  if (hasOwnReadHint(text)) return false;

  const lineCount = countContentLines(text);
  if (lineCount === 0) return false;

  const start = input.offset ?? 1;
  const end = start + lineCount - 1;
  const total = details?.truncation?.totalLines;
  if (total !== undefined) {
    // With a known file length we can tell whether the window reached EOF.
    return end < total;
  }
  // Without a total we can only infer more content when the window filled the
  // requested limit exactly; otherwise the read likely reached EOF and we must
  // not point the model past the end of the file.
  if (input.limit === undefined) return false;
  return lineCount >= input.limit;
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
    return `[wishcraft] ${total} lines, showing ${start}–${end}, next offset ${next}`;
  }
  return `[wishcraft] ${lineCount} lines, showing ${start}–${end}, next offset ${next}`;
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

/**
 * Append a continuation hint to a core `read` tool_result.
 * Returns a replacement payload; never mutates `event.input` or `event.content`.
 */
export function appendReadHintToEvent(event: {
  input?: unknown;
  content?: unknown;
  details?: unknown;
}): { content: Array<{ type: "text"; text: string }> } | undefined {
  const text = extractReadToolResultText(event.content);
  const input = event.input as ReadToolInput | undefined;
  const details = event.details as ReadHintDetails | undefined;
  if (!shouldAppendReadHint(input, text, details) || !input) return undefined;
  if (!Array.isArray(event.content)) return undefined;
  const hint = formatReadHint(input, text, details);
  return {
    content: [
      ...(event.content as Array<{ type: "text"; text: string }>),
      { type: "text", text: hint },
    ],
  };
}

/** Apply the opt-out and append a hint without mutating `event.input`. */
export function maybeAppendReadHint(
  event: {
    input?: unknown;
    content?: unknown;
    details?: unknown;
  },
  cwd?: string,
): { content: Array<{ type: "text"; text: string }> } | undefined {
  if (!readHintsEnabled(readSettings(cwd).wishcraft)) return undefined;
  return appendReadHintToEvent(event);
}
