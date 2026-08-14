import {
  CustomEditor,
  type KeybindingsManager,
} from "@earendil-works/pi-coding-agent";
import {
  isKeyRelease,
  matchesKey,
} from "@earendil-works/pi-tui";
import type { AutocompleteProvider } from "@earendil-works/pi-tui";
import { matchesConfiguredShortcut } from "../src/shortcuts/matching.ts";
import { getOneOffBashCommandContext } from "./completion.ts";
import {
  DEFAULT_EDITOR_BOUNDARY_SHORTCUTS,
  droppedPathTextFromInput,
  isCommandUndoShortcut,
  isPrintableInput,
  resetShellHistoryBrowse,
} from "./editor-input.ts";
import { overlayGhostSuggestion } from "./editor-ghost.ts";
import type {
  BashModeEditorOptions,
  GhostSuggestion,
} from "./types.ts";

export class BashModeEditor extends CustomEditor {
  private readonly keybindingsRef: KeybindingsManager;
  private readonly optionsRef: BashModeEditorOptions;
  private wrappedProviderInstalled = false;
  private shellHistoryIndex = -1;
  private shellHistoryItems: string[] = [];
  private shellHistoryDraft = "";
  private promptHistoryDraft: string | null = null;
  private ghost: GhostSuggestion | null = null;
  private ghostAbort: AbortController | null = null;
  private ghostToken = 0;

  constructor(
    tui: any,
    theme: any,
    keybindings: KeybindingsManager,
    options: BashModeEditorOptions,
  ) {
    super(tui, theme, keybindings);
    this.keybindingsRef = keybindings;
    this.optionsRef = options;
  }

  setAutocompleteProvider(provider: AutocompleteProvider): void {
    super.setAutocompleteProvider(provider);
    this.wrappedProviderInstalled = false;
  }

  installAutocompleteProvider(provider: AutocompleteProvider): void {
    this.setAutocompleteProvider(provider);
    this.wrappedProviderInstalled = true;
  }

  hasWrappedProvider(): boolean {
    return this.wrappedProviderInstalled;
  }

  getGhostSuggestion(): GhostSuggestion | null {
    return this.isShellCompletionContext() ? this.ghost : null;
  }

  refreshGhostSuggestion(): void {
    this.scheduleGhostUpdate();
  }

  clearGhostSuggestion(): void {
    this.ghostAbort?.abort();
    this.ghostAbort = null;
    this.ghost = null;
  }

  dismissBashModeUi(): void {
    resetShellHistoryBrowse(this);
    this.clearGhostSuggestion();

    const cancelAutocomplete = Reflect.get(this, "cancelAutocomplete");
    if (typeof cancelAutocomplete === "function") {
      cancelAutocomplete.call(this);
    }
    this.tui.requestRender();
  }

  handleInput(data: string): void {
    const droppedPathText = droppedPathTextFromInput(data);
    if (droppedPathText !== null) {
      this.insertTextAtCursor(droppedPathText);
      resetShellHistoryBrowse(this);
      if (this.isShellCompletionContext()) {
        this.scheduleGhostUpdate();
      } else {
        this.clearGhostSuggestion();
      }
      return;
    }

    const pasteInProgress =
      data.includes("\x1b[200~") || Reflect.get(this, "isInPaste") === true;
    if (pasteInProgress) {
      super.handleInput(data);
      if (Reflect.get(this, "isInPaste") === true) {
        return;
      }
    } else {
      const bashMode = this.optionsRef.isBashModeActive();
      const oneOffBashCommand = !bashMode && this.isOneOffBashCommandContext();

      if (isCommandUndoShortcut(data)) {
        const undo = Reflect.get(this, "undo");
        if (typeof undo === "function") {
          undo.call(this);
        }
        resetShellHistoryBrowse(this);
        if (this.isShellCompletionContext()) {
          this.scheduleGhostUpdate();
        } else {
          this.clearGhostSuggestion();
        }
        return;
      }

      if (bashMode && this.keybindingsRef.matches(data, "app.interrupt")) {
        this.optionsRef.onExitBashMode();
        return;
      }

      if (
        bashMode &&
        this.keybindingsRef.matches(data, "app.clear") &&
        this.optionsRef.isShellRunning()
      ) {
        this.optionsRef.onInterrupt();
        return;
      }

      if (
        bashMode &&
        this.keybindingsRef.matches(data, "tui.editor.cursorUp")
      ) {
        this.navigateShellHistory(-1);
        return;
      }

      if (
        bashMode &&
        this.keybindingsRef.matches(data, "tui.editor.cursorDown")
      ) {
        this.navigateShellHistory(1);
        return;
      }

      const editorBoundaryShortcuts =
        this.optionsRef.editorBoundaryShortcuts ??
        DEFAULT_EDITOR_BOUNDARY_SHORTCUTS;
      if (
        !isKeyRelease(data) &&
        matchesConfiguredShortcut(data, editorBoundaryShortcuts.start)
      ) {
        this.moveCursorToEditorBoundary("start");
        return;
      }

      if (
        !isKeyRelease(data) &&
        matchesConfiguredShortcut(data, editorBoundaryShortcuts.end)
      ) {
        this.moveCursorToEditorBoundary("end");
        return;
      }

      if (
        (bashMode || oneOffBashCommand) &&
        this.keybindingsRef.matches(data, "tui.input.tab")
      ) {
        this.completeGhostSuggestionOneToken();
        return;
      }

      if (
        (bashMode || oneOffBashCommand) &&
        this.keybindingsRef.matches(data, "tui.editor.cursorRight") &&
        this.acceptGhostSuggestion()
      ) {
        return;
      }

      if (
        !bashMode &&
        matchesKey(data, "up") &&
        this.isPromptHistoryRecallPosition()
      ) {
        const navigateHistory = Reflect.get(this, "navigateHistory");
        if (typeof navigateHistory === "function") {
          if (Reflect.get(this, "historyIndex") === -1) {
            this.promptHistoryDraft = this.getText();
          }
          navigateHistory.call(this, -1);
          return;
        }
      }

      if (
        !bashMode &&
        matchesKey(data, "down") &&
        Reflect.get(this, "historyIndex") > -1
      ) {
        const isOnLastVisualLine = Reflect.get(this, "isOnLastVisualLine");
        if (
          typeof isOnLastVisualLine !== "function" ||
          isOnLastVisualLine.call(this)
        ) {
          const navigateHistory = Reflect.get(this, "navigateHistory");
          if (typeof navigateHistory === "function") {
            navigateHistory.call(this, 1);
            if (
              Reflect.get(this, "historyIndex") === -1 &&
              this.promptHistoryDraft !== null
            ) {
              const draft = this.promptHistoryDraft;
              this.promptHistoryDraft = null;
              const setTextInternal = Reflect.get(this, "setTextInternal");
              if (typeof setTextInternal === "function") {
                setTextInternal.call(this, draft);
              } else {
                this.setText(draft);
              }
            }
            return;
          }
        }
      }

      if (
        bashMode &&
        this.keybindingsRef.matches(data, "tui.input.submit") &&
        !this.keybindingsRef.matches(data, "tui.input.newLine")
      ) {
        if (this.optionsRef.isShellRunning()) {
          this.optionsRef.onNotify("Shell command already running", "warning");
          return;
        }

        const command = this.getExpandedText().trim();
        if (!command) return;
        this.clearGhostSuggestion();
        resetShellHistoryBrowse(this);
        this.optionsRef.onEditorSubmit?.();
        this.optionsRef.onSubmitCommand(command);
        this.setText("");
        this.refreshGhostSuggestion();
        return;
      }

      super.handleInput(data);
    }

    if (!this.isShellCompletionContext()) {
      resetShellHistoryBrowse(this);
      this.clearGhostSuggestion();
      return;
    }

    if (
      pasteInProgress ||
      isPrintableInput(data) ||
      this.keybindingsRef.matches(data, "tui.editor.deleteCharBackward") ||
      this.keybindingsRef.matches(data, "tui.editor.deleteCharForward") ||
      this.keybindingsRef.matches(data, "tui.editor.deleteWordBackward") ||
      this.keybindingsRef.matches(data, "tui.editor.deleteWordForward") ||
      this.keybindingsRef.matches(data, "tui.editor.deleteToLineStart") ||
      this.keybindingsRef.matches(data, "tui.editor.deleteToLineEnd") ||
      this.keybindingsRef.matches(data, "tui.input.newLine") ||
      this.keybindingsRef.matches(data, "tui.editor.cursorLeft") ||
      this.keybindingsRef.matches(data, "tui.editor.cursorRight")
    ) {
      resetShellHistoryBrowse(this);
      this.scheduleGhostUpdate();
    }
  }

  render(width: number): string[] {
    const lines = super.render(width);
    if (!this.isShellCompletionContext()) return lines;
    if (!this.ghost) return lines;

    return (
      overlayGhostSuggestion(
        lines,
        width,
        this.getText(),
        this.ghost,
        this.getCursor(),
      ) ?? lines
    );
  }

  private isShellCompletionContext(): boolean {
    return (
      this.optionsRef.isBashModeActive() || this.isOneOffBashCommandContext()
    );
  }

  private isOneOffBashCommandContext(): boolean {
    return getOneOffBashCommandContext(this.getExpandedText()) !== null;
  }

  private moveCursorToEditorBoundary(position: "start" | "end"): void {
    const state = Reflect.get(this, "state");
    const lines =
      state && typeof state === "object" ? Reflect.get(state, "lines") : null;
    if (!Array.isArray(lines)) {
      throw new Error("Editor cursor state is unavailable");
    }

    if (position === "start") {
      Reflect.set(state, "cursorLine", 0);
      Reflect.set(state, "cursorCol", 0);
    } else {
      const lastLine = Math.max(0, lines.length - 1);
      Reflect.set(state, "cursorLine", lastLine);
      Reflect.set(
        state,
        "cursorCol",
        typeof lines[lastLine] === "string" ? lines[lastLine].length : 0,
      );
    }

    Reflect.set(this, "lastAction", null);
    Reflect.set(this, "preferredVisualCol", null);
    Reflect.set(this, "snappedFromCursorCol", null);
    this.tui.requestRender();
  }

  private acceptGhostSuggestion(): boolean {
    if (!this.ghost) return false;
    const text = this.getExpandedText();
    if (text.includes("\n")) return false;

    const cursor = this.getCursor();
    if (cursor.line !== 0 || cursor.col !== text.length) return false;

    if (!this.ghost.value.startsWith(text) || this.ghost.value === text)
      return false;
    this.setText(this.ghost.value);
    this.clearGhostSuggestion();
    return true;
  }

  /**
   * Advance the buffer by exactly one token/segment toward the active ghost
   * suggestion (the next whitespace-delimited chunk). Repeated Tabs step
   * through the rest of the suggestion one token at a time instead of
   * inserting the whole line at once. The ghost stays live after a partial
   * step so the next Tab continues from where it left off, and it is only
   * cleared once the full suggestion has been inserted.
   */
  private completeGhostSuggestionOneToken(): boolean {
    if (!this.ghost) return false;
    const text = this.getExpandedText();
    if (text.includes("\n")) return false;

    const cursor = this.getCursor();
    if (cursor.line !== 0 || cursor.col !== text.length) return false;

    const value = this.ghost.value;
    if (!value.startsWith(text) || value === text) return false;

    // Next chunk = leading whitespace (when the current token is complete)
    // plus the next whitespace-delimited token from the projected ghost value.
    const rest = value.slice(text.length);
    const nextChunk = rest.match(/^\s*\S*/)?.[0];
    if (!nextChunk) return false;

    const next = text + nextChunk;
    this.setText(next);

    if (value === next) {
      // The full ghost suggestion is now in the buffer; nothing is left to
      // step through.
      this.clearGhostSuggestion();
    } else if (value.startsWith(next)) {
      // Re-resolve against the updated buffer rather than reusing a stale ghost.
      this.scheduleGhostUpdate();
    } else {
      this.clearGhostSuggestion();
    }
    return true;
  }

  private isPromptHistoryRecallPosition(): boolean {
    if (this.isShowingAutocomplete()) return false;

    const history = Reflect.get(this, "history");
    if (!Array.isArray(history) || history.length === 0) return false;

    const lines = this.getLines();
    const cursor = this.getCursor();
    if (lines.length === 1) {
      return cursor.line === 0 && cursor.col === (lines[0]?.length ?? 0);
    }

    const isOnFirstVisualLine = Reflect.get(this, "isOnFirstVisualLine");
    if (
      typeof isOnFirstVisualLine === "function" &&
      !isOnFirstVisualLine.call(this)
    ) {
      return false;
    }

    return cursor.line === 0;
  }

  private navigateShellHistory(direction: -1 | 1): void {
    const prefix = this.shellHistoryDraft || this.getExpandedText();
    if (this.shellHistoryIndex === -1) {
      this.shellHistoryDraft = prefix;
      this.shellHistoryItems = this.optionsRef.getHistoryEntries(prefix);
    }

    if (this.shellHistoryItems.length === 0) {
      this.optionsRef.onNotify("No shell history matches", "info");
      return;
    }

    if (direction < 0) {
      this.shellHistoryIndex = Math.min(
        this.shellHistoryItems.length - 1,
        this.shellHistoryIndex + 1,
      );
      this.setText(
        this.shellHistoryItems[this.shellHistoryIndex] ??
          this.shellHistoryDraft,
      );
      this.clearGhostSuggestion();
      return;
    }

    this.shellHistoryIndex -= 1;
    if (this.shellHistoryIndex < 0) {
      this.shellHistoryIndex = -1;
      this.setText(this.shellHistoryDraft);
      this.scheduleGhostUpdate();
      return;
    }

    this.setText(
      this.shellHistoryItems[this.shellHistoryIndex] ?? this.shellHistoryDraft,
    );
    this.clearGhostSuggestion();
  }

  private scheduleGhostUpdate(): void {
    const text = this.getExpandedText();
    const currentToken = ++this.ghostToken;
    this.ghostAbort?.abort();

    const controller = new AbortController();
    this.ghostAbort = controller;
    this.optionsRef
      .resolveGhostSuggestion(text, controller.signal)
      .then((ghost) => {
        if (controller.signal.aborted || currentToken !== this.ghostToken)
          return;
        this.ghost = ghost;
        this.tui.requestRender();
      })
      .catch((error) => {
        if (error instanceof Error && error.message === "aborted") return;
        console.debug(
          "[wishcraft] Failed to resolve bash ghost suggestion:",
          error,
        );
      });
  }
}
