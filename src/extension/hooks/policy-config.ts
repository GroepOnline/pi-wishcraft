/**
 * policy-config.ts
 * ---------------------------------------------------------------------------
 * Declarative policy rules (deny / inject) from global wishcraft settings.
 * No process spawn — pure regex evaluation in-process.
 *
 *   "wishcraft": {
 *     "policyEnabled": true,
 *     "policy": [
 *       { "action": "deny", "tool": "bash", "match": "sudo\\s+rm", "reason": "…" },
 *       { "action": "inject", "tool": "read", "match": "\\.env", "context": "…" }
 *     ]
 *   }
 *
 * policyEnabled defaults to true when policy is non-empty; explicit false
 * is the kill-switch. Malformed rules are dropped (no throw).
 * ---------------------------------------------------------------------------
 */

export interface DenyPolicyRule {
  action: "deny";
  tool: string;
  match: string;
  reason: string;
}

export interface InjectPolicyRule {
  action: "inject";
  tool: string;
  pathMatch: string;
  context: string;
}

export type PolicyRule = DenyPolicyRule | InjectPolicyRule;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validRegex(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

function parseDenyRule(v: unknown): DenyPolicyRule | null {
  if (!isRecord(v) || v.action !== "deny") return null;
  if (typeof v.tool !== "string" || !v.tool.trim()) return null;
  if (typeof v.match !== "string" || !v.match.trim()) return null;
  if (typeof v.reason !== "string" || !v.reason.trim()) return null;
  if (!validRegex(v.match)) return null;
  return {
    action: "deny",
    tool: v.tool,
    match: v.match,
    reason: v.reason,
  };
}

function parseInjectRule(v: unknown): InjectPolicyRule | null {
  if (!isRecord(v) || v.action !== "inject") return null;
  if (typeof v.tool !== "string" || !v.tool.trim()) return null;
  if (typeof v.match !== "string" || !v.match.trim()) return null;
  if (typeof v.context !== "string" || !v.context.trim()) return null;
  if (!validRegex(v.match)) return null;
  return {
    action: "inject",
    tool: v.tool,
    match: v.match,
      _re: new RegExp(v.match),
    context: v.context,
  };
}

function parsePolicyRule(v: unknown): PolicyRule | null {
  if (!isRecord(v)) return null;
  if (v.action === "deny") return parseDenyRule(v);
  if (v.action === "inject") return parseInjectRule(v);
  return null;
}

/** Parse wishcraft policy settings. Invalid rules are dropped. */
export function parsePolicySettings(wishcraftSettings: unknown): {
  enabled: boolean;
  rules: PolicyRule[];
} {
  if (!isRecord(wishcraftSettings)) return { enabled: false, rules: [] };
  const raw = wishcraftSettings.policy;
  if (!Array.isArray(raw)) return { enabled: false, rules: [] };
  const rules = raw
    .map(parsePolicyRule)
    .filter((r): r is PolicyRule => r !== null);
  if (rules.length === 0) return { enabled: false, rules: [] };
  const enabled = wishcraftSettings.policyEnabled !== false;
  return { enabled, rules };
}
