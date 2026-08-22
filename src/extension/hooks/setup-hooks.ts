import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { RuntimeState } from "../core/types.ts";
import {
  getSettingsPath,
  readSettings,
  readSettingsFile,
} from "../settings/settings-io.ts";
import {
  commandsFor,
  parseHooksSettings,
  type WishcraftHooksSettings,
} from "./hooks-config.ts";
import {
  preToolUseVerdict,
  runHookCommand,
  type HookPayload,
} from "./hooks-runner.ts";
import { recordRepairs, repairToolInput } from "./repairs.ts";

let hooksSettings: WishcraftHooksSettings = {};
let hooksEnabled = false;
let repairsEnabled = true;
let pendingSessionContext: string | null = null;

function refreshSettings(cwd: string): void {
  const merged = readSettings(cwd).wishcraft;
  const globalWishcraft = readSettingsFile(getSettingsPath()).wishcraft;
  const parsed = parseHooksSettings(globalWishcraft);
  hooksSettings = parsed.hooks;
  hooksEnabled = parsed.enabled && hasAnyHook(parsed.hooks);
  repairsEnabled =
    !merged ||
    typeof merged !== "object" ||
    (merged as Record<string, unknown>).repairsEnabled !== false;
}

function hasAnyHook(hooks: WishcraftHooksSettings): boolean {
  return (
    (hooks.preToolUse?.length ?? 0) > 0 ||
    (hooks.postToolUse?.length ?? 0) > 0 ||
    (hooks.sessionStart?.length ?? 0) > 0 ||
    (hooks.turnEnd?.length ?? 0) > 0
  );
}

function basePayload(
  event: HookPayload["hook_event_name"],
  ctx: any,
  fallbackCwd: string = process.cwd(),
): HookPayload {
  return {
    session_id: ctx?.sessionManager?.getSessionFile?.() ?? "unknown",
    cwd: ctx?.cwd ?? fallbackCwd,
    hook_event_name: event,
    permission_mode: "",
  };
}

export function setupHooks(
  pi: ExtensionAPI,
  rt: RuntimeState,
  cwd: string = process.cwd(),
): void {
  refreshSettings(cwd);

  pi.on("session_start", async (_event, ctx) => {
    const sessionCwd = ctx?.cwd ?? cwd;
    refreshSettings(sessionCwd);
    if (!hooksEnabled) return;
    const cmds = commandsFor(hooksSettings, "sessionStart");
    if (cmds.length === 0) return;
    const payload = basePayload("sessionStart", ctx, cwd);
    payload.source = "startup";
    const contexts = await Promise.all(cmds.map((c) => runHookCommand(c, payload)));
    const extra = contexts
      .map((o) => o.parsed?.hookSpecificOutput?.additionalContext ?? "")
      .filter(Boolean)
      .join("\n");
    if (extra) pendingSessionContext = extra;
    for (const o of contexts) {
      if (o.parsed?.systemMessage && ctx?.ui?.notify) {
        ctx.ui.notify(o.parsed.systemMessage, "info");
      }
    }
  });

  pi.on("context", async (event: any) => {
    if (!pendingSessionContext || !event?.messages) return;
    const extra = pendingSessionContext;
    pendingSessionContext = null;
    return { messages: [{ role: "user", content: extra, timestamp: Date.now() }] };
  });

  pi.on("tool_call", async (event: any, ctx: any) => {
    const toolName: string = event.toolName;
    if (repairsEnabled && event.input && typeof event.input === "object") {
      const result = repairToolInput(toolName, event.input);
      if (result.repairs.length > 0) recordRepairs(result);
    }
    if (!hooksEnabled) return;
    const cmds = commandsFor(hooksSettings, "preToolUse", toolName);
    if (cmds.length === 0) return;
    const payload = basePayload("preToolUse", ctx);
    payload.tool_use_id = event.toolCallId;
    payload.tool_name = toolName;
    payload.tool_input = event.input;
    for (const cmd of cmds) {
      const out = await runHookCommand(cmd, payload);
      if (out.parsed?.systemMessage && ctx?.ui?.notify) ctx.ui.notify(out.parsed.systemMessage, "info");
      const verdict = preToolUseVerdict(out);
      if (verdict.deny) return { block: true, reason: verdict.reason };
    }
    return;
  });

  pi.on("tool_result", async (event: any, ctx: any) => {
    if (!hooksEnabled) return;
    const cmds = commandsFor(hooksSettings, "postToolUse", event.toolName);
    if (cmds.length === 0) return;
    const payload = basePayload("postToolUse", ctx);
    payload.tool_use_id = event.toolCallId;
    payload.tool_name = event.toolName;
    payload.tool_input = event.input;
    payload.tool_response = typeof event.content === "string" ? event.content : Array.isArray(event.content) ? event.content.map((c: any) => c.text ?? "").join("\n") : "";
    const outs = await Promise.all(cmds.map((c) => runHookCommand(c, payload)));
    let extra = "";
    for (const out of outs) {
      const add = out.parsed?.hookSpecificOutput?.additionalContext;
      if (add) extra += (extra ? "\n" : "") + add;
      if (out.parsed?.systemMessage && ctx?.ui?.notify) ctx.ui.notify(out.parsed.systemMessage, "info");
    }
    if (extra && Array.isArray(event.content)) return { content: [...event.content, { type: "text", text: extra }] };
    return;
  });

  pi.on("turn_end", async (_event: any) => {
    if (!hooksEnabled) return;
    const cmds = commandsFor(hooksSettings, "turnEnd");
    if (cmds.length === 0) return;
    const payload = basePayload("turnEnd", rt.currentCtx);
    const outs = await Promise.all(cmds.map((c) => runHookCommand(c, payload)));
    for (const out of outs) {
      if (out.parsed?.systemMessage && rt.currentCtx?.ui?.notify) rt.currentCtx.ui.notify(out.parsed.systemMessage, "info");
    }
  });
}
