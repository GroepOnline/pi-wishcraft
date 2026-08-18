/**
 * hooks-runner.ts
 * ---------------------------------------------------------------------------
 * Voert commando-hooks uit: JSON op stdin, JSON of exit-code op stdout.
 * ---------------------------------------------------------------------------
 */

import { spawn } from "node:child_process";
import type { HookCommand, HookEventName } from "./hooks-config.ts";

/** Standaard payload die elke hook krijgt (commandcode-compatibel). */
export interface HookPayload {
  session_id: string;
  transcript_path?: string;
  cwd: string;
  hook_event_name: HookEventName;
  permission_mode: string;
  tool_use_id?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: string;
  source?: string;
  [key: string]: unknown;
}

export interface HookOutput {
  exitCode: number | null;
  /** Geparste stdout-JSON, null bij lege/ongeldige stdout. */
  parsed: {
    continue?: boolean;
    stopReason?: string;
    suppressOutput?: boolean;
    systemMessage?: string;
    reason?: string;
    decision?: string;
    hookSpecificOutput?: {
      permissionDecision?: "allow" | "deny";
      permissionDecisionReason?: string;
      additionalContext?: string;
    };
  } | null;
  stderrFirstLine: string;
}

/**
 * Draai één hook-commando. Best-effort: een crashende hook blokkeert nooit de
 * sessie, maar levert een non-blocking foutmelding.
 */
export function runHookCommand(
  hook: HookCommand,
  payload: HookPayload,
): Promise<HookOutput> {
  return new Promise((resolve) => {
    const child = spawn(hook.command, {
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, WISHCRAFT_HOOK_EVENT: payload.hook_event_name },
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      try {
        child.kill("SIGTERM");
          // Settle immediately; a shell/descendant may never emit close.
          finish(null);
      } catch {
        // al dood
      }
    }, (hook.timeout ?? 30) * 1000);

    const finish = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      let parsed: HookOutput["parsed"] = null;
      const trimmed = stdout.trim();
      if (trimmed) {
        try {
          const raw = JSON.parse(trimmed);
          if (typeof raw === "object" && raw !== null) parsed = raw as HookOutput["parsed"];
        } catch {
          // geen JSON → "geen mening", tool gaat door
        }
      }
      resolve({
        exitCode,
        parsed,
        stderrFirstLine: stderr.split("\n").find((l) => l.trim()) ?? "",
      });
    };

    child.stdout?.on("data", (d: Buffer) => (stdout += d.toString("utf8")));
    child.stderr?.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
    child.on("error", (error) => {
      stderr += String(error);
      finish(null);
    });
    child.on("close", (code) => finish(code));

    try {
      child.stdin?.write(JSON.stringify(payload));
      child.stdin?.end();
    } catch {
      // stdin weg → hook zonder input; laat 'm zelf falen
    }
  });
}

/**
 * Bepaal de block-uitspraak van PreToolUse-output.
 * Exit 2 = deny (reason: stdout-permissionDecisionReason > stderr-first-line).
 */
export function preToolUseVerdict(
  out: HookOutput,
): { deny: boolean; reason?: string } {
  if (out.exitCode === 2) {
    return {
      deny: true,
      reason:
        out.parsed?.hookSpecificOutput?.permissionDecisionReason ??
        out.stderrFirstLine ??
        "blocked by hook",
    };
  }
  if (out.parsed?.hookSpecificOutput?.permissionDecision === "deny") {
    return {
      deny: true,
      reason:
        out.parsed.hookSpecificOutput.permissionDecisionReason ??
        out.parsed.reason ??
        "blocked by hook",
    };
  }
  return { deny: false };
}
