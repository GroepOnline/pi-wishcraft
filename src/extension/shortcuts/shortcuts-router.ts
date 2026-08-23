import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { copyToClipboard } from "@earendil-works/pi-coding-agent";
import { isKeyRelease, type SelectItem } from "@earendil-works/pi-tui";

import {
  matchesConfiguredShortcut,
  matchesStashShortcutInput,
} from "../../shortcuts/matching.ts";
import { hasNonWhitespaceText } from "../history/prompt-history.ts";
import {
  buildStashPreview,
  pushStashHistory,
  persistStashHistory,
} from "../history/stash-history.ts";
import { readRecentProjectPrompts } from "../history/prompt-history.ts";
import { showSelectOverlay } from "../ui/menu-views.ts";
import {
  captureCurrentProjectIdea,
  captureIdeaFromText,
  openQueuePicker,
} from "../queue/queue-integration.ts";
import { setBashModeActive } from "../commands/bash-mode-actions.ts";
import { config } from "../core/state.ts";
import {
  PROJECT_PROMPT_HISTORY_LIMIT,
  STASH_PREVIEW_WIDTH,
} from "../core/constants.ts";
import type { PowerlineShortcutAction, RuntimeState } from "../core/types.ts";

export function getCurrentEditorText(ctx: any, editor: any): string {
  const editorText = editor?.getExpandedText?.();
  if (typeof editorText === "string" && editorText.length > 0)
    return editorText;
  return ctx.ui.getEditorText?.() ?? editorText ?? "";
}

export function addStashHistoryEntry(rt: RuntimeState, text: string): void {
  const changed = pushStashHistory(rt.stashedPromptHistory, text);
  if (!changed) {
    return;
  }

  persistStashHistory(rt.stashedPromptHistory);
}

export function copyTextToClipboard(
  ctx: any,
  text: string,
  successMessage?: string,
): void {
  copyToClipboard(text);
  if (successMessage) {
    ctx.ui.notify(successMessage, "info");
  }
}

export function getEditorTextForClipboard(
  rt: RuntimeState,
  ctx: any,
): string | null {
  const text = getCurrentEditorText(ctx, rt.currentEditor);
  if (hasNonWhitespaceText(text)) {
    return text;
  }

  ctx.ui.notify("Editor is empty", "info");
  return null;
}

export async function selectStashedPromptFromHistory(
  rt: RuntimeState,
  ctx: any,
): Promise<string | null> {
  const historyItems = [...rt.stashedPromptHistory];
  const items: SelectItem[] = historyItems.map((entry, index) => ({
    value: String(index),
    label: `#${index + 1} ${buildStashPreview(entry, STASH_PREVIEW_WIDTH)}`,
  }));

  const selected = await showSelectOverlay(
    ctx,
    "Stash history",
    "↑↓ navigate • enter insert • esc cancel",
    items,
    Math.min(items.length, 10),
  );
  if (!selected) return null;

  const i = Number.parseInt(selected.value, 10);
  return historyItems[i] ?? null;
}

export async function selectProjectPromptFromHistory(
  ctx: any,
  prompts: string[],
): Promise<string | null> {
  const items: SelectItem[] = prompts.map((entry, index) => ({
    value: String(index),
    label: `#${index + 1} ${buildStashPreview(entry, STASH_PREVIEW_WIDTH)}`,
  }));

  const selected = await showSelectOverlay(
    ctx,
    "Recent project prompts",
    "↑↓ navigate • enter insert • esc cancel",
    items,
    Math.min(items.length, 10),
  );
  if (!selected) return null;

  const i = Number.parseInt(selected.value, 10);
  return prompts[i] ?? null;
}

export async function selectPromptHistorySource(
  ctx: any,
  stashCount: number,
  projectPromptCount: number,
): Promise<"stash" | "project" | null> {
  const items: SelectItem[] = [];

  if (stashCount > 0) {
    items.push({
      value: "stash",
      label: "Stashed prompts",
      description: `${stashCount} saved`,
    });
  }

  if (projectPromptCount > 0) {
    items.push({
      value: "project",
      label: "Recent project prompts",
      description: `${projectPromptCount} recent`,
    });
  }

  if (items.length === 0) {
    return null;
  }

  if (items.length === 1) {
    return items[0]?.value === "project" ? "project" : "stash";
  }

  const selected = await showSelectOverlay(
    ctx,
    "Prompt history",
    "↑↓ navigate • enter open • esc cancel",
    items,
    items.length,
  );
  if (!selected) return null;

  return selected.value === "project" ? "project" : "stash";
}

export async function insertSelectedPromptHistoryEntry(
  rt: RuntimeState,
  ctx: any,
  selected: string,
): Promise<void> {
  const currentText = getCurrentEditorText(ctx, rt.currentEditor);
  if (!hasNonWhitespaceText(currentText)) {
    ctx.ui.setEditorText(selected);
    ctx.ui.notify("Inserted prompt", "info");
    return;
  }

  const action = await ctx.ui.select("Insert prompt", [
    "Replace",
    "Append",
    "Cancel",
  ]);

  if (action === "Replace") {
    ctx.ui.setEditorText(selected);
    ctx.ui.notify("Replaced editor with prompt", "info");
    return;
  }

  if (action === "Append") {
    const separator =
      currentText.endsWith("\n") || selected.startsWith("\n") ? "" : "\n";
    ctx.ui.setEditorText(`${currentText}${separator}${selected}`);
    ctx.ui.notify("Appended prompt", "info");
  }
}

export async function handleSelectedStashHistoryEntry(
  rt: RuntimeState,
  ctx: any,
  selected: string,
): Promise<void> {
  const action = await ctx.ui.select("Stashed prompt", [
    "Insert",
    "Promote to idea",
    "Cancel",
  ]);

  if (action === "Insert") {
    await insertSelectedPromptHistoryEntry(rt, ctx, selected);
    return;
  }

  if (action === "Promote to idea") {
    try {
      captureIdeaFromText(rt, ctx, selected);
    } catch (error) {
      ctx.ui.notify(
        error instanceof Error ? error.message : String(error),
        "error",
      );
    }
  }
}

export function isStashShortcutInput(data: string): boolean {
  return matchesStashShortcutInput(data, {
    includePrintableSharpS: config.stashSharpSShortcut,
  });
}

export function isPromptHistoryShortcutInput(
  rt: RuntimeState,
  data: string,
): boolean {
  return (
    matchesConfiguredShortcut(data, rt.resolvedShortcuts.stashHistory) ||
    (rt.resolvedShortcuts.stashHistory === "ctrl+alt+h" &&
      (/^\x1b\[104(?::\d*)?(?::\d*)?;7(?::\d+)?u$/.test(data) ||
        data === "\x1b[27;7;104~" ||
        data === "\x1b[27;7;72~"))
  );
}

export function getPowerlineShortcutAction(
  rt: RuntimeState,
  data: string,
): PowerlineShortcutAction | null {
  if (isKeyRelease(data)) return null;

  if (isPromptHistoryShortcutInput(rt, data)) {
    return { kind: "stashHistory" };
  }
  if (matchesConfiguredShortcut(data, rt.resolvedShortcuts.copyEditor)) {
    return { kind: "copyEditor" };
  }
  if (matchesConfiguredShortcut(data, rt.resolvedShortcuts.cutEditor)) {
    return { kind: "cutEditor" };
  }
  if (matchesConfiguredShortcut(data, rt.resolvedShortcuts.ideaCapture)) {
    return { kind: "ideaCapture" };
  }
  if (matchesConfiguredShortcut(data, rt.resolvedShortcuts.queueOpen)) {
    return { kind: "queueOpen" };
  }
  if (matchesConfiguredShortcut(data, rt.bashModeSettings.toggleShortcut)) {
    return { kind: "bashMode" };
  }

  return null;
}

export function runPowerlineShortcut(
  pi: ExtensionAPI,
  rt: RuntimeState,
  ctx: any,
  action: PowerlineShortcutAction,
): void {
  if (action.kind === "stashHistory") {
    void openStashHistory(rt, ctx);
    return;
  }

  if (action.kind === "copyEditor" || action.kind === "cutEditor") {
    const text = getEditorTextForClipboard(rt, ctx);
    if (!text) return;

    copyTextToClipboard(
      ctx,
      text,
      action.kind === "copyEditor" ? "Copied editor text" : undefined,
    );
    if (action.kind === "cutEditor") {
      ctx.ui.setEditorText("");
      ctx.ui.notify("Cut editor text", "info");
    }
    return;
  }

  if (action.kind === "ideaCapture") {
    const text = getEditorTextForClipboard(rt, ctx);
    if (!text) return;

    const item = captureCurrentProjectIdea(rt, ctx, text);
    if (item) {
      ctx.ui.setEditorText("");
    }
    return;
  }

  if (action.kind === "queueOpen") {
    void openQueuePicker(pi, rt, ctx, "queue");
    return;
  }

  if (action.kind === "bashMode") {
    void setBashModeActive(rt, !rt.bashModeActive, ctx);
    return;
  }
}

export function stashOrRestoreEditorText(rt: RuntimeState, ctx: any): void {
  const rawText = getCurrentEditorText(ctx, rt.currentEditor);
  const hasStash = rt.stashedEditorText !== null;

  if (!hasNonWhitespaceText(rawText)) {
    if (!hasStash) {
      ctx.ui.notify("Nothing to stash", "info");
      return;
    }

    ctx.ui.setEditorText(rt.stashedEditorText);
    rt.stashedEditorText = null;
    ctx.ui.setStatus("stash", undefined);
    ctx.ui.notify("Stash restored", "info");
    return;
  }

  rt.stashedEditorText = rawText;
  addStashHistoryEntry(rt, rawText);
  ctx.ui.setEditorText("");
  ctx.ui.setStatus("stash", "stash");
  ctx.ui.notify(hasStash ? "Stash updated" : "Text stashed", "info");
}

export async function openStashHistory(
  rt: RuntimeState,
  ctx: any,
): Promise<void> {
  let projectPrompts: string[] = [];

  try {
    projectPrompts = readRecentProjectPrompts(
      ctx.cwd,
      PROJECT_PROMPT_HISTORY_LIMIT,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`Failed to load project prompts: ${message}`, "warning");
  }

  if (rt.stashedPromptHistory.length === 0 && projectPrompts.length === 0) {
    ctx.ui.notify("No prompt history yet", "info");
    return;
  }

  const source = await selectPromptHistorySource(
    ctx,
    rt.stashedPromptHistory.length,
    projectPrompts.length,
  );
  if (!source) {
    return;
  }

  const selected =
    source === "project"
      ? await selectProjectPromptFromHistory(ctx, projectPrompts)
      : await selectStashedPromptFromHistory(rt, ctx);
  if (!selected) return;

  if (source === "stash") {
    await handleSelectedStashHistoryEntry(rt, ctx, selected);
    return;
  }

  await insertSelectedPromptHistoryEntry(rt, ctx, selected);
}
