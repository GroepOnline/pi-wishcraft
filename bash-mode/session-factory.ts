import { spawnSync } from "node:child_process";
import { ManagedShellSession } from "./shell-session.ts";
import { PtyManagedShellSession } from "./ptyshell-managed.ts";
import type { BashTranscriptStore } from "./transcript.ts";

export type SessionPreference = "auto" | "v1" | "v2";

export interface CreateShellSessionOptions {
  cwd: string;
  shellEnv: NodeJS.ProcessEnv;
  prefer?: SessionPreference;
  transcript: BashTranscriptStore;
  onStateChange?: () => void;
  onCommandSuccess?: (command: string, cwd: string) => void;
  initScript?: string | null;
  shellPath?: string;
}

let lastPtyProbe: boolean | null = null;

let warnedScriptMissing = false;

function warnScriptMissingOnce(): void {
  if (warnedScriptMissing) return;
  warnedScriptMissing = true;
  console.warn(
    "[wishcraft] script(1) unavailable; bash mode v2 runs commands via plain pipes (no color, no interactive stdin) until it is installed",
  );
}

export function isPtyPreferred(): boolean {
  if (lastPtyProbe === null) {
    const probe = spawnSync("script", ["--version"], { stdio: "ignore" });
    lastPtyProbe = probe.status === 0;
  }
  return lastPtyProbe;
}

export function _resetPtyProbeForTests(): void {
  lastPtyProbe = null;
}

export class BashSessionFactoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BashSessionFactoryError";
  }
}

export function createShellSession(
  opts: CreateShellSessionOptions,
): PtyManagedShellSession | ManagedShellSession {
  // ponytail: a per-command transcript store is required so the first
  // runCommand() does not crash on a missing startCommand() call.
  if (!opts.transcript) {
    throw new BashSessionFactoryError(
      "createShellSession requires a transcript store; construct one from bash-mode/transcript.ts and pass it in",
    );
  }
  const preference = opts.prefer ?? "auto";
  if (preference === "v2" && !isPtyPreferred()) {
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
