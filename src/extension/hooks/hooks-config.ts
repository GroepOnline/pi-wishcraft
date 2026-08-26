/**
 * hooks-config.ts
 * ---------------------------------------------------------------------------
 * Settings-vorm voor de wishcraft hooks-laag (commandcode-achtig, Pi-gegoten).
 *
 *   "wishcraft": {
 *     "hooksEnabled": true,
 *     "hooks": {
 *       "preToolUse":  [{ "matcher": "bash", "hooks": [{ "command": "…", "timeout": 10 }] }],
 *       "postToolUse": [{ "hooks": [{ "command": "…" }] }],
 *       "sessionStart":[{ "hooks": [{ "command": "…" }] }],
 *       "turnEnd":     [{ "hooks": [{ "command": "…" }] }]
 *     }
 *   }
 *
 * matcher = regex op de tool-name (voor tool-events); weglaten = alles.
 * command = executable dat JSON op stdin krijgt en optioneel JSON op stdout
 * teruggeeft. timeout in seconden (default 30, max 600).
 * ---------------------------------------------------------------------------
 */

import { SETTING_DEFAULTS } from "../../config/settings-registry.ts";

export type HookEventName = "preToolUse" | "postToolUse" | "sessionStart" | "turnEnd";

export interface HookCommand {
  type: "command";
  command: string;
  timeout?: number;
}

export interface HookDefinition {
  matcher?: string;
  hooks: HookCommand[];
}

export interface WishcraftHooksSettings {
  preToolUse?: HookDefinition[];
  postToolUse?: HookDefinition[];
  sessionStart?: HookDefinition[];
  turnEnd?: HookDefinition[];
}

export const DEFAULT_HOOK_TIMEOUT_S = 30;
export const MAX_HOOK_TIMEOUT_S = 600;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Parse + valideer één command-hook uit settings (best-effort, fatal-loos). */
export function parseHookCommand(v: unknown): HookCommand | null {
  if (!isRecord(v) || typeof v.command !== "string" || !v.command.trim())
    return null;
  const timeout =
    typeof v.timeout === "number" && Number.isFinite(v.timeout)
      ? Math.min(Math.max(1, Math.round(v.timeout)), MAX_HOOK_TIMEOUT_S)
      : DEFAULT_HOOK_TIMEOUT_S;
  return { type: "command", command: v.command, timeout };
}

/** Parse + valideer één hook-definitie (matcher + handlers). */
export function parseHookDefinition(v: unknown): HookDefinition | null {
  if (!isRecord(v) || !Array.isArray(v.hooks)) return null;
  const hooks = v.hooks
    .map(parseHookCommand)
    .filter((h): h is HookCommand => h !== null);
  if (hooks.length === 0) return null;
  const matcher = typeof v.matcher === "string" ? v.matcher : undefined;
  return { matcher, hooks };
}

function parseEventList(v: unknown): HookDefinition[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const defs = v
    .map(parseHookDefinition)
    .filter((d): d is HookDefinition => d !== null);
  return defs.length > 0 ? defs : undefined;
}

/** Parse de volledige wishcraft.hooks settings-tree. Ongeldige delen vallen weg. */
export function parseHooksSettings(
  wishcraftSettings: unknown,
): { enabled: boolean; hooks: WishcraftHooksSettings } {
  if (!isRecord(wishcraftSettings)) return { enabled: false, hooks: {} };
  const enabled =
    typeof wishcraftSettings.hooksEnabled === "boolean"
      ? wishcraftSettings.hooksEnabled
      : SETTING_DEFAULTS["wishcraft.hooksEnabled"];
  const raw = wishcraftSettings.hooks;
  if (!isRecord(raw)) return { enabled, hooks: {} };
  return {
    enabled,
    hooks: {
      preToolUse: parseEventList(raw.preToolUse),
      postToolUse: parseEventList(raw.postToolUse),
      sessionStart: parseEventList(raw.sessionStart),
      turnEnd: parseEventList(raw.turnEnd),
    },
  };
}

/** Matcht een tool-name tegen een matcher (regex; leeg = alles). */
export function hookMatchesTool(matcher: string | undefined, toolName: string): boolean {
  if (!matcher) return true;
  try {
    return new RegExp(matcher).test(toolName);
  } catch {
    // kapotte regex → letterlijke vergelijking
    return matcher === toolName;
  }
}

/** Alle commando's voor een event die op dit tool draaien, in volgorde. */
export function commandsFor(
  hooks: WishcraftHooksSettings,
  event: HookEventName,
  toolName?: string,
): HookCommand[] {
  const defs = hooks[event];
  if (!defs) return [];
  const out: HookCommand[] = [];
  for (const def of defs) {
    if (toolName !== undefined && !hookMatchesTool(def.matcher, toolName))
      continue;
    out.push(...def.hooks);
  }
  return out;
}
