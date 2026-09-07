import type { BashCommandRecord, BashModeSettings, BashTranscriptSnapshot } from "./types.ts";

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function utf8Tail(value: string, maxBytes: number): string {
  if (maxBytes <= 0) return "";
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length <= maxBytes) return value;

  let start = bytes.length - maxBytes;
  while (start < bytes.length && (bytes[start]! & 0xc0) === 0x80) start += 1;
  return bytes.subarray(start).toString("utf8");
}

function compactLines(lines: string[]): string[] {
  const normalized: string[] = [];
  for (const line of lines) {
    const sanitized = line.replace(/\r/g, "");
    if (sanitized.length === 0) {
      normalized.push("");
      continue;
    }
    normalized.push(...sanitized.split("\n"));
  }
  return normalized;
}

export class BashTranscriptStore {
  private readonly settings: Pick<BashModeSettings, "transcriptMaxLines" | "transcriptMaxBytes">;
  private commands: BashCommandRecord[] = [];
  private commandIndex = new Map<string, BashCommandRecord>();
  private totalLines = 0;
  private totalBytes = 0;
  private truncatedCommands = 0;

  constructor(settings: Pick<BashModeSettings, "transcriptMaxLines" | "transcriptMaxBytes">) {
    this.settings = settings;
  }

  startCommand(id: string, command: string, cwdAtStart: string): BashCommandRecord {
    const entry: BashCommandRecord = {
      id,
      command,
      cwdAtStart,
      startedAt: Date.now(),
      output: [],
      outputBytes: 0,
      exitCode: null,
      finishedAt: null,
      truncated: false,
    };

    this.commands.push(entry);
    this.commandIndex.set(id, entry);
    this.enforceLimits();
    return entry;
  }

  appendOutput(id: string, chunk: string): void {
    const entry = this.commandIndex.get(id);
    if (!entry || !chunk) return;

    const lines = compactLines([chunk]);
    if (lines.length === 0) return;

    entry.output.push(...lines);
    const addedBytes = lines.reduce((sum, line) => sum + byteLength(line) + 1, 0);
    entry.outputBytes += addedBytes;
    this.totalLines += lines.length;
    this.totalBytes += addedBytes;
    this.enforceLimits();
  }

  finishCommand(id: string, exitCode: number): void {
    const entry = this.commandIndex.get(id);
    if (!entry) return;

    entry.exitCode = exitCode;
    entry.finishedAt = Date.now();
  }

  clear(): void {
    this.commands = [];
    this.commandIndex.clear();
    this.totalLines = 0;
    this.totalBytes = 0;
    this.truncatedCommands = 0;
  }

  getSnapshot(): BashTranscriptSnapshot {
    return {
      commands: this.commands.map((command) => ({
        ...command,
        output: [...command.output],
      })),
      totalLines: this.totalLines,
      totalBytes: this.totalBytes,
      truncatedCommands: this.truncatedCommands,
    };
  }

  /**
   * Shallow tail for hot render paths: last `count` commands with only the
   * last `outputTail` lines each, no deep copy (the always-on powerline
   * reads nothing else). Full snapshots stay on getSnapshot for
   * doctor/export paths.
   */
  recentCommands(
    count: number,
    outputTail = 6,
  ): { commands: BashCommandRecord[]; truncatedCommands: number } {
    return {
      commands: this.commands
        .slice(-count)
        .map((command) => ({ ...command, output: command.output.slice(-outputTail) })),
      truncatedCommands: this.truncatedCommands,
    };
  }

  private enforceLimits(): void {
    while (
      this.commands.length > 1
      && (this.totalLines > this.settings.transcriptMaxLines || this.totalBytes > this.settings.transcriptMaxBytes)
    ) {
      const removed = this.commands.shift();
      if (!removed) break;
      this.commandIndex.delete(removed.id);
      this.totalLines = Math.max(0, this.totalLines - removed.output.length);
      this.totalBytes = Math.max(0, this.totalBytes - removed.outputBytes);
      this.markTruncated(removed);
    }

    // A single active command used to bypass both global limits because there
    // was no older command to evict. Trim that command from the head instead:
    // bash mode is a tail-oriented live view, so the newest output is the
    // useful part and memory remains bounded even for multi-megabyte logs.
    const oldest = this.commands[0];
    if (!oldest) return;

    while (oldest.output.length > 0 && this.totalLines > this.settings.transcriptMaxLines) {
      this.dropOldestLine(oldest);
    }
    while (oldest.output.length > 1 && this.totalBytes > this.settings.transcriptMaxBytes) {
      this.dropOldestLine(oldest);
    }

    if (oldest.output.length === 1 && this.totalBytes > this.settings.transcriptMaxBytes) {
      const previous = oldest.output[0]!;
      const previousBytes = byteLength(previous) + 1;
      const bytesOutsideLine = Math.max(0, this.totalBytes - previousBytes);
      const lineBudget = Math.max(0, this.settings.transcriptMaxBytes - bytesOutsideLine - 1);
      const tail = utf8Tail(previous, lineBudget);
      const tailBytes = byteLength(tail) + 1;
      oldest.output[0] = tail;
      oldest.outputBytes = Math.max(0, oldest.outputBytes - previousBytes + tailBytes);
      this.totalBytes = Math.max(0, this.totalBytes - previousBytes + tailBytes);
      this.markTruncated(oldest);
    }
  }

  private dropOldestLine(command: BashCommandRecord): void {
    const removed = command.output.shift();
    if (removed === undefined) return;
    const removedBytes = byteLength(removed) + 1;
    command.outputBytes = Math.max(0, command.outputBytes - removedBytes);
    this.totalLines = Math.max(0, this.totalLines - 1);
    this.totalBytes = Math.max(0, this.totalBytes - removedBytes);
    this.markTruncated(command);
  }

  private markTruncated(command: BashCommandRecord): void {
    if (command.truncated) return;
    command.truncated = true;
    this.truncatedCommands += 1;
  }
}
