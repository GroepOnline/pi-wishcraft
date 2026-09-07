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
  moveCursorToEditorBoundary as moveCursorToEditorBoundaryImpl,
  resetShellHistoryBrowse,
} from "./editor-input.ts";
import {
  acceptGhostSuggestion as acceptGhostSuggestionImpl,
  completeGhostSuggestionOneToken as completeGhostSuggestionOneTokenImpl,
  overlayGhostSuggestion,
} from "./editor-ghost.ts";
import {
  isPromptHistoryRecallPosition as isPromptHistoryRecallPositionImpl,
  navigateShellHistory as navigateShellHistoryImpl,
} from "./editor-history.ts";
import type {
  BashModeEditorOptions,
  GhostSuggestion,
} from "./types.ts";

const BRACKETED_PASTE_START = "\x1b[200~";
const BRACKETED_PASTE_END = "\x1b[201~";

function splitTrailingPasteMarkerPrefix(value: string): [string, string] {
  let tail = "";
  for (const marker of [BRACKETED_PASTE_START, BRACKETED_PASTE_END]) {
    const max = Math.min(marker.length - 1, value.length);
    for (let length = max; length > tail.length; length -= 1) {
      const candidate = value.slice(-length);
      if (marker.startsWith(candidate)) {
        tail = candidate;
        break;
      }
    }
  }
  return tail ? [value.slice(0, -tail.length), tail] : [value, ""];
}

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
  private ghostSchedule: ReturnType<typeof setTimeout> | null = null;
  /** A bracketed paste was split across input chunks while forwarding. */
  private forwardPasteOpen = false;
  /** Trailing prefix of a bracketed-paste delimiter awaiting the next input chunk. */
  private forwardPasteMarkerTail = "";

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

  /** Resolve a ghost immediately for callers that need a settled refresh. */
  async refreshGhostSuggestionNow(): Promise<void> {
    const text = this.getExpandedText();
    const currentToken = ++this.ghostToken;
    this.ghostAbort?.abort();
    this.ghostSchedule = null;

    const controller = new AbortController();
    this.ghostAbort = controller;
    const ghost = await this.optionsRef.resolveGhostSuggestion(text, controller.signal);
    if (controller.signal.aborted || currentToken !== this.ghostToken) return;
    this.ghost = ghost;
    this.tui.requestRender();
  }

  clearGhostSuggestion(): void {
    this.ghostAbort?.abort();
    this.ghostAbort = null;
    if (this.ghostSchedule) clearTimeout(this.ghostSchedule);
    this.ghostSchedule = null;
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
    // v2 forward-mode gate, shared by the paste branch (issue #72) and the
    // per-keystroke forward further down: while a command runs, input
    // belongs to the child stdin, never to the editor buffer behind it.
    const forwardActive =
      this.optionsRef.isBashModeActive() &&
      this.optionsRef.isShellRunning() &&
      (this.optionsRef.forwardWhileRunning?.() ?? false) &&
      this.optionsRef.onForwardInput != null;
    if (!forwardActive) {
      this.forwardPasteOpen = false;
      this.forwardPasteMarkerTail = "";
    } else {
      data = this.forwardPasteMarkerTail + data;
      const [complete, tail] = splitTrailingPasteMarkerPrefix(data);
      data = complete;
      this.forwardPasteMarkerTail = tail;
      if (!data) return;
    }

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
      data.includes(BRACKETED_PASTE_START) ||
      data.includes(BRACKETED_PASTE_END) ||
      Reflect.get(this, "isInPaste") === true ||
      (forwardActive && this.forwardPasteOpen);
    if (pasteInProgress) {
      if (forwardActive) {
        const startIndex = data.lastIndexOf(BRACKETED_PASTE_START);
        const endIndex = data.lastIndexOf(BRACKETED_PASTE_END);
        if (startIndex !== -1 || endIndex !== -1) {
          this.forwardPasteOpen = startIndex > endIndex;
        }
        const payload = data
          .replaceAll(BRACKETED_PASTE_START, "")
          .replaceAll(BRACKETED_PASTE_END, "");
        if (payload) this.optionsRef.onForwardInput?.(payload);
        return;
      }
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

      // v2 forward-mode: while a command runs, printable input goes to the
      // PTY stdin (AE1). Interrupt stays a keybinding above; key-releases
      // and multi-key sequences stay in the editor. Enter (\r) and EOF
      // (\x04) must also forward — line-oriented stdin programs (read,
      // sudo, git rebase -i) cannot proceed without a line terminator.
      // Opt-in via forwardWhileRunning so v1 run-blocked behavior unchanged.
      // (forwardActive is computed above; bracketed pastes take the paste
      // branch, which forwards the stripped payload too.)
      if (
        forwardActive &&
        !isKeyRelease(data) &&
        (isPrintableInput(data) || data === "\r" || data === "\n" || data === "\x04")
      ) {
        this.optionsRef.onForwardInput?.(data);
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
        (bashMode || oneOffBashCommand) &&
        this.keybindingsRef.matches(data, "tui.input.submit") &&
        !this.keybindingsRef.matches(data, "tui.input.newLine")
      ) {
        // One-off bang prompts run the text after the prefix (mirrors pi's
        // own !/!! handling in interactive-mode.js); anything else submits
        // verbatim. Without the strip the bang would hit bash history
        // expansion (`!cmd` = replay a previous command) instead of `cmd`.
        const raw = this.getExpandedText().trim();
        const oneOff = getOneOffBashCommandContext(raw);
        const command = oneOff ? oneOff.command.trim() : raw;
        if (!command) {
          // Bash-off bare `!`: fall back to pi's own submit handling, whose
          // `if (command)` guard turns an empty command into a normal prompt
          // (pre-interception behavior). Full bash mode keeps the return.
          // This must run before the shell-running guard: a bare `!` while a
          // managed shell job runs should still delegate to pi, not be
          // swallowed by the "already running" warning.
          if (!bashMode) {
            super.handleInput(data);
          }
          return;
        }

        if (this.optionsRef.isShellRunning()) {
          this.optionsRef.onNotify("Shell command already running", "warning");
          return;
        }
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
  }  private isOneOffBashCommandContext(): boolean {
    return getOneOffBashCommandContext(this.getExpandedText()) !== null;
  }

  private moveCursorToEditorBoundary(position: "start" | "end"): void {
    moveCursorToEditorBoundaryImpl(this, position);
  }

  private acceptGhostSuggestion(): boolean {
    return acceptGhostSuggestionImpl(this);
  }

  private completeGhostSuggestionOneToken(): boolean {
    return completeGhostSuggestionOneTokenImpl(this);
  }

  private isPromptHistoryRecallPosition(): boolean {
    return isPromptHistoryRecallPositionImpl(this);
  }

  private navigateShellHistory(direction: -1 | 1): void {
    navigateShellHistoryImpl(this, direction);
  }

  private scheduleGhostUpdate(): void {
    const text = this.getExpandedText();
    const currentToken = ++this.ghostToken;
    this.ghostAbort?.abort();
    if (this.ghostSchedule) clearTimeout(this.ghostSchedule);
    this.ghostSchedule = null;

    const controller = new AbortController();
    this.ghostAbort = controller;
    // Start immediately so editor actions have deterministic refresh semantics.
    // The abort signal and token still discard stale results when typing races
    // with an in-flight history/filesystem lookup.
    this.optionsRef
      .resolveGhostSuggestion(text, controller.signal)
      .then((ghost) => {
        if (controller.signal.aborted || currentToken !== this.ghostToken) return;
        this.ghost = ghost;
        this.tui.requestRender();
      })
      .catch((error) => {
        if (controller.signal.aborted || (error instanceof Error && error.message === "aborted")) return;
        console.debug("[wishcraft] Failed to resolve bash ghost suggestion:", error);
      });
  }
}
