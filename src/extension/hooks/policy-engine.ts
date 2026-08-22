/**
 * policy-engine.ts
 * ---------------------------------------------------------------------------
 * Pure in-process policy evaluation (deny before tool use, inject after).
 * ---------------------------------------------------------------------------
 */

import type { PolicyRule } from "./policy-config.ts";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Text to match deny rules against (bash command or serialized input). */
export function toolInputText(toolName: string, input: unknown): string {
  if (toolName === "bash" && isRecord(input) && typeof input.command === "string") {
    return input.command;
  }
  try {
    return JSON.stringify(input ?? {});
  } catch {
    return String(input ?? "");
  }
}

/** Path from tool input (read/write/edit and common aliases). */
export function toolPath(input: unknown): string | null {
  if (!isRecord(input)) return null;
  for (const key of ["path", "filePath", "absolutePath", "target_file", "file_path"]) {
    const v = input[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

export type PreToolUsePolicyVerdict =
  | { block: true; reason: string }
  | { block: false };

/** First matching deny rule wins. */
export function evalPreToolUsePolicy(
  rules: PolicyRule[],
  toolName: string,
  input: unknown,
): PreToolUsePolicyVerdict {
  const text = toolInputText(toolName, input);
  for (const rule of rules) {
    if (rule.action !== "deny" || rule.tool !== toolName) continue;
    try {
      if (new RegExp(rule.match).test(text)) {
        return { block: true, reason: rule.reason };
      }
    } catch {
      // invalid regex at runtime — skip
    }
  }
  return { block: false };
}

/** All matching inject rules contribute context (in order). */
export function evalPostToolUsePolicy(
  rules: PolicyRule[],
  toolName: string,
  input: unknown,
): { additionalContext: string } | null {
  const path = toolPath(input);
  if (path === null) return null;
  let extra = "";
  for (const rule of rules) {
    if (rule.action !== "inject" || rule.tool !== toolName) continue;
    try {
      if ((rule._re ?? new RegExp(rule.match)).test(path)) {
        extra += (extra ? "\n" : "") + rule.context;
      }
    } catch {
      // invalid regex at runtime — skip
    }
  }
  return extra ? { additionalContext: extra } : null;
}
