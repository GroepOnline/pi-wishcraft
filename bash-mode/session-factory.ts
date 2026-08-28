import { PtyManagedShellSession } from "./ptyshell-managed.ts";
import {
  _resetScriptAvailableForTests,
  defaultScriptAvailable,
} from "./pty-session.ts";
import type { BashTranscriptStore } from "./transcript.ts";

export type SessionPreference = "auto" | "v2";

export interface CreateShellSessionOptions {
  cwd: string;
  prefer?: SessionPreference;
  transcript: BashTranscriptStore;
  onStateChange?: () => void;
  onCommandSuccess?: (command: string, cwd: string) => void;
  initScript?: string | null;
  shellPath?: string;
  /** Override the script(1) availability probe (tests). */
  scriptAvailable?: () => boolean;
}

let warnedScriptMissing = false;

export function _resetWarnForTests(): void {
  warnedScriptMissing = false;
}

function warnScriptMissingOnce(): void {
  if (warnedScriptMissing) return;
  warnedScriptMissing = true;
  console.warn(
    "[wishcraft] script(1) unavailable; bash mode v2 runs commands via plain pipes (no color, no interactive stdin) until it is installed",
  );
}

export function isPtyPreferred(): boolean {
  return defaultScriptAvailable();
}

export function _resetPtyProbeForTests(): void {
  _resetScriptAvailableForTests();
}

export function createShellSession(
  opts: CreateShellSessionOptions,
): PtyManagedShellSession {
  // transcript is a typed required field (TS enforces it); the factory has
  // no untyped JS consumers.
  const ptyAvailable = opts.scriptAvailable ? opts.scriptAvailable() : isPtyPreferred();
  if (!ptyAvailable) {
    warnScriptMissingOnce();
  }
  // auto and v2 both route through the PTY-backed managed session; when
  // script(1) is absent it degrades per command to plain pipes (KTD2).
  return new PtyManagedShellSession(
    opts.shellPath ?? "/bin/sh",
    opts.cwd,
    opts.transcript,
    opts.onStateChange ?? (() => {}),
    opts.onCommandSuccess ?? (() => {}),
    opts.initScript ?? null,
    opts.scriptAvailable,
  );
}
