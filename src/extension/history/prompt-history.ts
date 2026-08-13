import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { getAgentPath } from "../../paths/agent-dirs.ts";
import { isRecord } from "../settings/settings-io.ts";
import { PROMPT_HISTORY_LIMIT } from "../core/constants.ts";

const PROMPT_HISTORY_TRACKED = Symbol.for("powerlinePromptHistoryTracked");
const PROMPT_HISTORY_STATE_KEY = Symbol.for("powerlinePromptHistoryState");

export interface PromptHistoryEditor {
  addToHistory?: (text: string) => void;
}

export type PromptHistoryState = { savedPromptHistory: string[] };

export function hasNonWhitespaceText(text: string): boolean {
  return text.trim().length > 0;
}

export function isPromptHistoryState(
  value: unknown,
): value is PromptHistoryState {
  return (
    isRecord(value) &&
    Array.isArray(value.savedPromptHistory) &&
    value.savedPromptHistory.every((entry) => typeof entry === "string")
  );
}

export function getPromptHistoryState(): PromptHistoryState {
  const existing = Reflect.get(globalThis, PROMPT_HISTORY_STATE_KEY);
  if (isPromptHistoryState(existing)) {
    return existing;
  }

  const state: PromptHistoryState = { savedPromptHistory: [] };
  Reflect.set(globalThis, PROMPT_HISTORY_STATE_KEY, state);
  return state;
}

export function readPromptHistory(
  editor: PromptHistoryEditor | null | undefined,
): string[] {
  if (!editor) return [];
  const history = Reflect.get(editor, "history");
  if (!Array.isArray(history)) return [];

  const normalized: string[] = [];
  for (const entry of history) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    if (normalized.length > 0 && normalized[normalized.length - 1] === trimmed)
      continue;
    normalized.push(trimmed);
    if (normalized.length >= PROMPT_HISTORY_LIMIT) break;
  }

  return normalized;
}

export function snapshotPromptHistory(
  editor: PromptHistoryEditor | null | undefined,
): void {
  const history = readPromptHistory(editor);
  if (history.length > 0) {
    getPromptHistoryState().savedPromptHistory = [...history];
  }
}

export function restorePromptHistory(
  editor: PromptHistoryEditor | null | undefined,
): void {
  const { savedPromptHistory } = getPromptHistoryState();
  if (!savedPromptHistory.length || typeof editor?.addToHistory !== "function")
    return;

  for (let i = savedPromptHistory.length - 1; i >= 0; i--) {
    editor.addToHistory(savedPromptHistory[i]);
  }
}

export function trackPromptHistory(
  editor: PromptHistoryEditor | null | undefined,
): void {
  if (!editor || typeof editor.addToHistory !== "function") return;
  if (Reflect.get(editor, PROMPT_HISTORY_TRACKED)) {
    snapshotPromptHistory(editor);
    return;
  }

  const originalAddToHistory = editor.addToHistory.bind(editor);
  editor.addToHistory = (text: string) => {
    originalAddToHistory(text);
    snapshotPromptHistory(editor);
  };
  Reflect.set(editor, PROMPT_HISTORY_TRACKED, true);
  snapshotPromptHistory(editor);
}

function getSessionsPath(): string {
  return getAgentPath("sessions");
}

function getProjectSessionsPath(cwd: string): string {
  const projectKey = cwd
    .replace(/^[/\\]+|[/\\]+$/g, "")
    .replace(/[\\/]+/g, "-");

  return join(getSessionsPath(), `--${projectKey}--`);
}

export function getPromptHistoryText(content: unknown): string {
  if (typeof content === "string") {
    return content.replace(/\s+/g, " ").trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  const parts: string[] = [];
  for (const block of content) {
    if (
      !isRecord(block) ||
      block.type !== "text" ||
      typeof block.text !== "string"
    ) {
      continue;
    }
    parts.push(block.text);
  }

  return parts.join("\n").replace(/\s+/g, " ").trim();
}

export function readRecentProjectPrompts(cwd: string, limit: number): string[] {
  const sessionsPath = getProjectSessionsPath(cwd);
  if (!existsSync(sessionsPath)) {
    return [];
  }

  const promptEntries: { text: string; timestamp: number }[] = [];
  const fileNames = readdirSync(sessionsPath).filter((fileName) =>
    fileName.endsWith(".jsonl"),
  );

  for (const fileName of fileNames) {
    const filePath = join(sessionsPath, fileName);
    const lines = readFileSync(filePath, "utf-8").split("\n");

    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (
        !line ||
        !line.includes('"type":"message"') ||
        !line.includes('"role":"user"')
      ) {
        continue;
      }

      let entry: unknown;
      try {
        entry = JSON.parse(line);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Failed to parse session file ${filePath}: ${message}`,
          { cause: error },
        );
      }

      if (
        !isRecord(entry) ||
        entry.type !== "message" ||
        !isRecord(entry.message) ||
        entry.message.role !== "user"
      ) {
        continue;
      }

      const text = getPromptHistoryText(entry.message.content);
      if (!hasNonWhitespaceText(text)) {
        continue;
      }

      const timestamp =
        typeof entry.message.timestamp === "number"
          ? entry.message.timestamp
          : typeof entry.timestamp === "string"
            ? Date.parse(entry.timestamp)
            : 0;

      promptEntries.push({
        text,
        timestamp: Number.isFinite(timestamp) ? timestamp : 0,
      });
    }
  }

  promptEntries.sort((a, b) => b.timestamp - a.timestamp);

  const prompts: string[] = [];
  const seen = new Set<string>();
  for (const entry of promptEntries) {
    if (seen.has(entry.text)) {
      continue;
    }

    seen.add(entry.text);
    prompts.push(entry.text);
    if (prompts.length >= limit) {
      return prompts;
    }
  }

  return prompts;
}
