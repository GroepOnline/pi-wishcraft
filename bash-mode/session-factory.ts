import { ManagedShellSession } from "./shell-session.ts";
import { PtyManagedShellSession } from "./ptyshell-managed.ts";
import {
  _resetScriptAvailableForTests,
  defaultScriptAvailable,
} from "./pty-session.ts";
import type { BashTranscriptStore } from "./transcript.ts";

export type SessionPreference = "auto" | "v1" | "v2";

export interface CreateShellSessionOptions {
  cwd: string;
  prefer?: SessionPreference;
  transcript: BashTranscriptStore;
  onStateChange?: () => void;
  onCommandSuccess?: (command: string, cwd: string) => void;
  initScript?: string | null;
  shellPath?: string;
}

let warnedScriptMissing = false;

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
): PtyManagedShellSession | ManagedShellSession {
  // transcript is a typed required field (TS enforces it); the factory has
  // no untyped JS consumers.
  const preference = opts.prefer ?? "auto";
  if (preference !== "v1" && !isPtyPreferred()) {
    warnScriptMissingOnce();
  }
  // v2 (and auto) route through the PTY-backed managed session; when
  // script(1) is absent it degrades per command to plain pipes (KTD2).
  // Explicit prefer:"v1" is the strangler exit hatch until v1 deletion.
  if (preference !== "v1") {
    return new PtyManagedShellSession(
      opts.shellPath ?? "/bin/sh",
      opts.cwd,
      opts.transcript,
      opts.onStateChange ?? (() => {}),
      opts.onCommandSuccess ?? (() => {}),
      opts.initScript ?? null,
    );
  }
  return new ManagedShellSession(
    opts.shellPath ?? "/bin/sh",
    opts.cwd,
    opts.transcript,
    opts.onStateChange ?? (() => {}),
    opts.onCommandSuccess ?? (() => {}),
    opts.initScript ?? null,
  );
}
