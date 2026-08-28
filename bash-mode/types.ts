import type { KeybindingsManager } from "@earendil-works/pi-coding-agent";

import type { EditorBoundaryShortcuts } from "./editor-input.ts";

export interface BashModeSettings {
  toggleShortcut: string | null;
  transcriptMaxLines: number;
  transcriptMaxBytes: number;
  /** Shell commands sourced once when the managed shell starts (project-scoped init). */
  initScript: string | null;
}

export interface BashCommandRecord {
  id: string;
  command: string;
  startedAt: number;
  cwdAtStart: string;
  output: string[];
  outputBytes: number;
  exitCode: number | null;
  finishedAt: number | null;
  truncated: boolean;
}

export interface BashTranscriptSnapshot {
  commands: BashCommandRecord[];
  totalLines: number;
  totalBytes: number;
  truncatedCommands: number;
}

export interface GhostSuggestion {
  value: string;
  source:
    | "project-history"
    | "global-history"
    | "git"
    | "path"
    | "executable";
}

export interface ExtendedCompletionItem {
  value: string;
  label: string;
  description?: string;
  replacement: string;
  startCol: number;
  endCol: number;
  source:
    | "project-history"
    | "global-history"
    | "git"
    | "path"
    | "executable";
  score: number;
}

export interface ShellSessionState {
  ready: boolean;
  running: boolean;
  shellPath: string;
  shellName: string;
  cwd: string;
  lastExitCode: number | null;
}

/**
 * Common surface shared by v1 `ManagedShellSession` and the v2
 * PTY-backed `PtyManagedShellSession` (U13 cutover seam). writeStdin is
 * optional: only the v2 session supports editor forward-mode.
 */
export interface ManagedShellSessionLike {
  readonly state: ShellSessionState;
  ensureReady(): Promise<void>;
  runCommand(command: string): Promise<void>;
  interrupt(): void;
  dispose(): void;
  writeStdin?(data: string): void;
}

export { createForwardState, handleForwardInput, type ForwardState, type ForwardDecision, type PtyAction } from "./forward.ts";

export interface BashModeEditorOptions {
  keybindings: KeybindingsManager;
  isBashModeActive: () => boolean;
  isShellRunning: () => boolean;
  onExitBashMode: () => void;
  onSubmitCommand: (command: string) => void;
  onEditorSubmit?: () => void;
  editorBoundaryShortcuts?: EditorBoundaryShortcuts;
  onInterrupt: () => void;
  /** Forward raw input to a running shell (v2 PTY forward-mode, U4). */
  onForwardInput?: (data: string) => void;
  /**
   * Enable forward-mode: while a command runs, printable input routes to
   * the PTY stdin instead of the editor (AE1). v1 run-blocked behavior is
   * the default until a session opts in. Evaluated per keystroke so the
   * session kind (v1 vs v2) decides at input time.
   */
  forwardWhileRunning?: () => boolean;
  onNotify: (message: string, level?: "info" | "warning" | "error") => void;
  getHistoryEntries: (prefix: string) => string[];
  resolveGhostSuggestion: (
    text: string,
    signal: AbortSignal,
  ) => Promise<GhostSuggestion | null>;
}
