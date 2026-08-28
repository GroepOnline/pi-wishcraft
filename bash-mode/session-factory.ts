import { spawnSync } from "node:child_process";
import { ManagedShellSession } from "./shell-session.ts";
import type { BashTranscriptStore } from "./transcript.ts";

export type SessionPreference = "auto" | "v1" | "v2";

export interface CreateShellSessionOptions {
  cwd: string;
  shellEnv: NodeJS.ProcessEnv;
  prefer?: SessionPreference;
  transcript?: BashTranscriptStore;
  onStateChange?: () => void;
  onCommandSuccess?: (command: string, cwd: string) => void;
  initScript?: string | null;
  shellPath?: string;
}

let lastPtyProbe: boolean | null = null;

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

export function createShellSession(opts: CreateShellSessionOptions): ManagedShellSession {
  const preference = opts.prefer ?? "auto";
  if (preference === "v2" && !isPtyPreferred()) {
    console.warn("[wishcraft] v2 PTY session preferred but script(1) is unavailable; using v1 fallback");
  }
  return new ManagedShellSession(
    opts.shellPath ?? "/bin/sh",
    opts.cwd,
    opts.transcript as unknown as BashTranscriptStore,
    opts.onStateChange ?? (() => {}),
    opts.onCommandSuccess ?? (() => {}),
    opts.initScript ?? null,
  );
}
