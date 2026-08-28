import type {
  ExtensionAPI,
  ReadonlyFooterDataProvider,
  Theme,
} from "@earendil-works/pi-coding-agent";
import type { AutocompleteProvider } from "@earendil-works/pi-tui";

import { BashModeEditor } from "../../../bash-mode/editor.ts";
import {
  BashAutocompleteProvider,
  ModeAwareAutocompleteProvider,
  OneOffBashAutocompleteProvider,
} from "../../../bash-mode/completion-providers.ts";
import { getOneOffBashCommandContext } from "../../../bash-mode/completion.ts";
import {
  parseCompactQueuedPrompt,
  parseSigilIdeaCapture,
} from "../../../queue/store.ts";
import {
  getEditorAutocompleteProvider,
  passAutocompleteProviderThroughPreviousEditor,
} from "../../editor/autocomplete-chain.ts";
import { subscribeGitUpdates } from "../../git/status.ts";
import { ansi, colorEnabled, getFgAnsiCode } from "../../theme/colors.ts";
import {
  restorePromptHistory,
  snapshotPromptHistory,
  trackPromptHistory,
} from "../history/prompt-history.ts";
import {
  captureIdeaFromParsedInput,
  capturePostCompactPrompt,
  isSigilIdeaDraft,
  captureSigilGlyph,
  requestQueueRender,
  finishFailedCompaction,
} from "../queue/queue-integration.ts";
import {
  installFooterStatusRepaintHook,
  requestStatusRender,
} from "../core/segment-context.ts";
import { installPowerlineWidgets } from "./powerline-widgets.ts";
import {
  getPowerlineShortcutAction,
  isStashShortcutInput,
  runPowerlineShortcut,
  stashOrRestoreEditorText,
} from "../shortcuts/shortcuts-router.ts";
import {
  dismissWelcome,
  scheduleDismissWelcome,
} from "../welcome/welcome-control.ts";
import { config } from "../core/state.ts";
import type { RuntimeState } from "../core/types.ts";
import {
  ensureShellSession,
  getShellCwd,
  getShellHistoryEntries,
  getShellPath,
  runShellCommand,
  setBashModeActive,
} from "../commands/bash-mode-actions.ts";

export function setupCustomEditor(
  pi: ExtensionAPI,
  rt: RuntimeState,
  ctx: any,
) {
  snapshotPromptHistory(rt.currentEditor);
  if (!rt.enabled) {
    return;
  }

  rt.stashShortcutInputUnsubscribe?.();
  rt.stashShortcutInputUnsubscribe =
    typeof ctx.ui.onTerminalInput === "function"
      ? ctx.ui.onTerminalInput((data: string) => {
          if (!rt.enabled || !ctx.hasUI || rt.tuiRef?.hasOverlay?.()) {
            return undefined;
          }
          if (isStashShortcutInput(data)) {
            stashOrRestoreEditorText(rt, ctx);
            scheduleDismissWelcome(rt, ctx);
            rt.tuiRef?.requestRender();
            return { consume: true };
          }

          const powerlineShortcutAction = getPowerlineShortcutAction(rt, data);
          if (!powerlineShortcutAction) {
            return undefined;
          }

          runPowerlineShortcut(pi, rt, ctx, powerlineShortcutAction);
          scheduleDismissWelcome(rt, ctx);
          rt.tuiRef?.requestRender();
          return { consume: true };
        })
      : null;

  ctx.ui.setWidget("powerline-top", undefined);
  ctx.ui.setWidget("powerline-secondary", undefined);
  ctx.ui.setWidget("powerline-bash-transcript", undefined);
  ctx.ui.setWidget("powerline-status", undefined);
  ctx.ui.setWidget("powerline-queue-preview", undefined);
  ctx.ui.setWidget("powerline-last-prompt", undefined);

  let autocompleteFixed = false;
  const previousEditorFactory =
    typeof ctx.ui.getEditorComponent === "function"
      ? ctx.ui.getEditorComponent()
      : undefined;

  const editorFactory = (tui: any, editorTheme: any, keybindings: any) => {
    const previousEditor = previousEditorFactory?.(
      tui,
      editorTheme,
      keybindings,
    );
    const editor = new BashModeEditor(tui, editorTheme, keybindings, {
      keybindings,
      isBashModeActive: () => rt.bashModeActive,
      isShellRunning: () => rt.shellSession?.state.running ?? false,
      onExitBashMode: () => {
        void setBashModeActive(rt, false, ctx);
      },
      onSubmitCommand: (command) => void runShellCommand(rt, command, ctx),
      editorBoundaryShortcuts: {
        start: rt.resolvedShortcuts.editorStart,
        end: rt.resolvedShortcuts.editorEnd,
      },
      onInterrupt: () => {
        rt.shellSession?.interrupt();
        ctx.ui.notify("Sent interrupt to shell", "info");
      },
      onForwardInput: (data) => {
        rt.shellSession?.writeStdin?.(data);
      },
      forwardWhileRunning: () => rt.shellSession?.writeStdin != null,
      onNotify: (message, level = "info") => ctx.ui.notify(message, level),
      getHistoryEntries: (prefix) => getShellHistoryEntries(rt, prefix),
      resolveGhostSuggestion: async (text, signal) => {
        const oneOffBash = getOneOffBashCommandContext(text);
        if (oneOffBash) {
          const ghost = await rt.bashCompletionEngine.getGhostSuggestion(
            oneOffBash.command,
            getShellCwd(rt),
            getShellPath(),
            signal,
          );
          return ghost
            ? { ...ghost, value: `${oneOffBash.prefix}${ghost.value}` }
            : null;
        }

        return rt.bashCompletionEngine.getGhostSuggestion(
          text,
          getShellCwd(rt),
          getShellPath(),
          signal,
        );
      },
    });

    let installingPowerlineAutocompleteProvider = false;
    const originalSetAutocompleteProvider =
      editor.setAutocompleteProvider.bind(editor);
    editor.setAutocompleteProvider = (provider: AutocompleteProvider) => {
      if (installingPowerlineAutocompleteProvider) {
        originalSetAutocompleteProvider(provider);
        return;
      }

      originalSetAutocompleteProvider(
        passAutocompleteProviderThroughPreviousEditor(provider, previousEditor),
      );
      attachAutocompleteProvider();
    };

    const getInstalledAutocompleteProvider = ():
      AutocompleteProvider | undefined => {
      return (
        getEditorAutocompleteProvider(editor) ??
        getEditorAutocompleteProvider(previousEditor)
      );
    };

    const attachAutocompleteProvider = (): boolean => {
      if (editor.hasWrappedProvider()) return true;
      const defaultProvider = getInstalledAutocompleteProvider();
      if (!defaultProvider) return false;

      const bashProvider = new BashAutocompleteProvider();
      const oneOffBashProvider = new OneOffBashAutocompleteProvider();
      installingPowerlineAutocompleteProvider = true;
      try {
        editor.installAutocompleteProvider(
          new ModeAwareAutocompleteProvider(
            defaultProvider,
            bashProvider,
            oneOffBashProvider,
            () => rt.bashModeActive,
          ),
        );
      } finally {
        installingPowerlineAutocompleteProvider = false;
      }
      return true;
    };

    rt.currentEditor = editor;
    trackPromptHistory(editor);
    restorePromptHistory(editor);
    attachAutocompleteProvider();

    const originalHandleInput = editor.handleInput.bind(editor);
    editor.handleInput = (data: string) => {
      rt.lastEditorInputAt = Date.now();

      const isSubmit =
        keybindings.matches(data, "tui.input.submit") &&
        !keybindings.matches(data, "tui.input.newLine");
      const isFollowUpSubmit = keybindings.matches(
        data,
        "app.message.followUp",
      );
      if (!rt.bashModeActive && (isSubmit || isFollowUpSubmit)) {
        const sigilCapture = parseSigilIdeaCapture(
          editor.getExpandedText(),
          config.queue.captureSigil,
        );
        if (sigilCapture) {
          try {
            const item = captureIdeaFromParsedInput(rt, ctx, sigilCapture);
            if (item) {
              editor.addToHistory?.(editor.getExpandedText().trim());
              editor.setText("");
            }
          } catch (error) {
            ctx.ui.notify(
              error instanceof Error ? error.message : String(error),
              "error",
            );
          }
          scheduleDismissWelcome(rt, ctx);
          return;
        }
      }

      if (
        !rt.powerlineCompacting &&
        !rt.bashModeActive &&
        isSubmit &&
        typeof ctx.compact === "function"
      ) {
        const editorText = editor.getExpandedText().trim();
        const compactQueuedPrompt = parseCompactQueuedPrompt(editorText);
        if (editorText === "/compact" || compactQueuedPrompt) {
          editor.addToHistory?.(editorText);
          editor.setText("");
          if (compactQueuedPrompt) {
            capturePostCompactPrompt(rt, ctx, compactQueuedPrompt);
          }
          rt.powerlineCompacting = true;
          rt.deliverAfterRetrySettles = false;
          requestQueueRender(rt);
          ctx.compact({
            onError: (error: Error) => {
              finishFailedCompaction(rt, ctx, error.message);
              ctx.ui.notify(error.message, "error");
            },
          });
          scheduleDismissWelcome(rt, ctx);
          return;
        }
      }

      if (
        rt.powerlineCompacting &&
        !rt.bashModeActive &&
        (isSubmit || isFollowUpSubmit)
      ) {
        const text = editor.getExpandedText().trim();
        if (!text) return;
        if (text.startsWith("/")) {
          originalHandleInput(data);
          return;
        }
        editor.addToHistory?.(text);
        editor.setText("");
        capturePostCompactPrompt(rt, ctx, text);
        scheduleDismissWelcome(rt, ctx);
        return;
      }

      if (isStashShortcutInput(data)) {
        stashOrRestoreEditorText(rt, ctx);
        scheduleDismissWelcome(rt, ctx);
        return;
      }

      const powerlineShortcutAction = getPowerlineShortcutAction(rt, data);
      if (powerlineShortcutAction) {
        runPowerlineShortcut(pi, rt, ctx, powerlineShortcutAction);
        scheduleDismissWelcome(rt, ctx);
        return;
      }

      if (!autocompleteFixed && !getInstalledAutocompleteProvider()) {
        autocompleteFixed = true;
        snapshotPromptHistory(editor);
        ctx.ui.setEditorComponent(editorFactory);
        rt.currentEditor?.handleInput(data);
        return;
      }

      attachAutocompleteProvider();
      scheduleDismissWelcome(rt, ctx);
      originalHandleInput(data);
    };

    const originalRender = editor.render.bind(editor);
    editor.render = (width: number): string[] => {
      if (width < 10) {
        return originalRender(width);
      }

      const bc = (s: string) =>
          `${getFgAnsiCode("sep")}${s}${colorEnabled() ? ansi.reset : ""}`;
      const captureDraft =
        !rt.bashModeActive && isSigilIdeaDraft(editor.getExpandedText());
      const promptGlyph = rt.bashModeActive
        ? "$"
        : captureDraft
          ? captureSigilGlyph()
          : ">";
      const promptColor = captureDraft
        ? getFgAnsiCode("queue")
        : colorEnabled()
          ? ansi.getFgAnsi(200, 200, 200)
          : "";
      const prompt = `${promptColor}${promptGlyph}${colorEnabled() ? ansi.reset : ""}`;
      const promptPrefix = ` ${prompt} `;
      const contPrefix = "   ";
      const contentWidth = Math.max(1, width - 3);
      const lines = originalRender(contentWidth);

      if (lines.length === 0) return lines;

      let bottomBorderIndex = lines.length - 1;
      for (let i = lines.length - 1; i >= 1; i--) {
        const stripped = lines[i]?.replace(/\x1b\[[0-9;]*m/g, "") || "";
        if (stripped.length > 0 && /^─{3,}/.test(stripped)) {
          bottomBorderIndex = i;
          break;
        }
      }

      const result: string[] = [];
      result.push(" " + bc("─".repeat(width - 2)));

      for (let i = 1; i < bottomBorderIndex; i++) {
        const prefix = i === 1 ? promptPrefix : contPrefix;
        result.push(`${prefix}${lines[i] || ""}`);
      }

      if (bottomBorderIndex === 1) {
        result.push(`${promptPrefix}${" ".repeat(contentWidth)}`);
      }

      result.push(" " + bc("─".repeat(width - 2)));

      for (let i = bottomBorderIndex + 1; i < lines.length; i++) {
        result.push(lines[i] || "");
      }

      return result;
    };

    return editor;
  };

  ctx.ui.setEditorComponent(editorFactory);

  ctx.ui.setFooter(
    (tui: any, _theme: Theme, footerData: ReadonlyFooterDataProvider) => {
      rt.footerDataRef = footerData;
      rt.tuiRef = tui;
      installFooterStatusRepaintHook(rt, footerData);
      const unsub = footerData.onBranchChange(() => requestStatusRender(rt));
      const unsubGitUpdates = subscribeGitUpdates(() =>
        requestStatusRender(rt),
      );

      return {
        dispose() {
          unsub();
          unsubGitUpdates();
          rt.restoreFooterStatusRepaintHook?.();
          rt.restoreFooterStatusRepaintHook = null;
        },
        invalidate() {
          requestStatusRender(rt);
        },
        render(): string[] {
          return [""];
        },
      };
    },
  );

  installPowerlineWidgets(rt, ctx);
}
