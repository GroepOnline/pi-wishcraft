/**
 * ptyshell-managed.ts
 * ------------------------------------------------------------------------
 * Long-lived managed shell session backed by the v2 PTY runner (plan U13).
 *
 * Implements the same public surface as v1 `ManagedShellSession` so the
 * construction site in bash-mode-actions.ts can swap without touching
 * callers: `state`, `ensureReady()`, `runCommand()`, `interrupt()`,
 * `dispose()`, plus `writeStdin()` for editor forward-mode (U4).
 *
 * Every command runs in its own `script(1)` PTY via PtyShellSession, so
 * stdin-reading programs work and SGR color survives into the transcript.
 * `ready` is true from construction — there is no persistent shell process
 * to wait for; the PtyShellSession probes `script(1)` itself and degrades
 * per command to plain pipes when it is missing (KTD2).
 *
 * Divergence from v1 (documented): v1 sourced `initScript` once into a
 * long-lived shell. v2 has no persistent shell, so init runs as a preamble
 * of every command. That keeps env/paths set by init available per command
 * (ponytail: a persistent PTY shell is the upgrade path if init side
 * effects per command ever matter).
 * ------------------------------------------------------------------------
 */

import type { BashTranscriptStore } from "./transcript.ts";
import { PtyShellSession } from "./pty-session.ts";
import type { ShellSessionState } from "./types.ts";

export class PtyManagedShellSession {
  readonly state: ShellSessionState;
  private readonly transcript: BashTranscriptStore;
  private readonly onStateChange: () => void;
  private readonly onCommandSuccess: (command: string, cwd: string) => void;
  private readonly initScript: string;
  private readonly pty: PtyShellSession;
  private commandCounter = 0;
  private currentCommandId: string | null = null;

  constructor(
    shellPath: string,
    cwd: string,
    transcript: BashTranscriptStore,
    onStateChange: () => void,
    onCommandSuccess: (command: string, cwd: string) => void,
    initScript: string | null = null,
  ) {
    this.transcript = transcript;
    this.onStateChange = onStateChange;
    this.onCommandSuccess = onCommandSuccess;
    this.initScript = initScript ?? "";
    const shellName = shellPath.split("/").pop()?.toLowerCase() ?? "sh";
    this.state = {
      ready: true,
      running: false,
      shellPath,
      shellName,
      cwd,
      lastExitCode: null,
    };
    this.pty = new PtyShellSession({
      cwd,
      shellPath,
      onOutput: (line) => this.appendToTranscript(line),
      onStateChange,
      color: true,
    });
  }

  async ensureReady(): Promise<void> {
    // No persistent process; PtyShellSession probes script(1) lazily per
    // command and degrades to pipes when absent (KTD2).
  }

  async runCommand(command: string): Promise<void> {
    if (this.state.running) {
      throw new Error("Shell command already running");
    }

    const id = `cmd-${++this.commandCounter}`;
    this.currentCommandId = id;
    this.state.running = true;
    this.transcript.startCommand(id, command, this.state.cwd);
    this.onStateChange();
    try {
      const result = await this.pty.runCommand(
        this.initScript ? `${this.initScript}\n${command}` : command,
      );
      this.state.lastExitCode = result.exitCode;
      this.state.cwd = result.cwd;
      this.transcript.finishCommand(id, result.exitCode);
      if (result.exitCode === 0) {
        this.onCommandSuccess(command, result.cwd);
      }
    } catch (error) {
      this.transcript.finishCommand(id, 1);
      throw error;
    } finally {
      this.currentCommandId = null;
      this.state.running = false;
      this.onStateChange();
    }
  }

  writeStdin(data: string): void {
    this.pty.writeStdin(data);
  }

  interrupt(): void {
    this.pty.interrupt();
  }

  dispose(): void {
    this.pty.dispose();
  }

  private appendToTranscript(line: string): void {
    const id = this.currentCommandId;
    if (!id || !this.state.running) return;
    this.transcript.appendOutput(id, line);
    this.onStateChange();
  }
}