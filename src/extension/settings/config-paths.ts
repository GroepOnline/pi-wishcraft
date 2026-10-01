/**
 * config-paths.ts
 * ---------------------------------------------------------------------------
 * Read/validate/write helpers for dotted setting paths
 * (`powerline.segmentOptions.path.mode` → settings.json).
 *
 * Split out of `wishcraft-config.ts` (the overlay) so the setup wizard and the
 * diagnostics module can share them without importing the overlay — which
 * would close a cycle: overlay → wizard → overlay.
 * ---------------------------------------------------------------------------
 */

import {
  effectiveSettingValue,
  explainSettingValue,
  settingLabel,
  validationProblem,
} from "../../config/settings-registry.ts";
import { tr } from "../../i18n/index.ts";
import { isRecord, writeSettingKey } from "./settings-io.ts";
import type { ConfigItem, ConfigValue } from "./wishcraft-config-items.ts";

/** Nested read: "wishcraft.hooksEnabled" → settings.wishcraft.hooksEnabled. */
export function readConfigPath(
  settings: Record<string, unknown>,
  path: string,
): ConfigValue {
  let cur: unknown = settings;
  for (const part of path.split(".")) {
    if (!isRecord(cur)) return null;
    cur = cur[part];
  }
  if (
    typeof cur === "boolean" ||
    typeof cur === "string" ||
    typeof cur === "number"
  )
    return cur;
  return null;
}

/** True for path segments that would mutate Object.prototype. */
export function isUnsafeConfigKey(key: string): boolean {
  return key === "__proto__" || key === "constructor" || key === "prototype";
}

/**
 * Set `parts` (after the root key) on `root`. Returns false and leaves
 * `root` unchanged when a segment is `__proto__`, `constructor`, or `prototype`.
 */
export function assignNestedConfigValue(
  root: Record<string, unknown>,
  parts: string[],
  value: ConfigValue,
): boolean {
  for (const part of parts) {
    if (part === "__proto__" || part === "constructor" || part === "prototype") {
      return false;
    }
  }
  let node = root;
  for (let i = 0; i < parts.length; i++) {
    const key = parts[i]!;
    // Guard in this loop so CodeQL sees the key check next to the assignment.
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      return false;
    }
    if (i === parts.length - 1) {
      if (value === null) delete node[key];
      else node[key] = value;
    } else {
      if (!isRecord(node[key])) node[key] = {};
      node = node[key] as Record<string, unknown>;
    }
  }
  return true;
}

/**
 * Nested write (new object per level) + persist to settings.json.
 * An empty string for a text field means "clear" — the key is removed from
 * settings so the code falls through to the default.
 */
export function writeConfigPath(
  cwd: string,
  path: string,
  value: ConfigValue,
): boolean {
  const parts = path.split(".");
  const rootKey = parts[0]!;
  if (!rootKey || parts.some(isUnsafeConfigKey)) {
    return false;
  }
  return writeSettingKey(cwd, rootKey, (existing) => {
    // Shorthand string under powerline (e.g. "chef") is a preset name: keep it.
    const node: Record<string, unknown> = isRecord(existing)
      ? existing
      : rootKey === "powerline" && typeof existing === "string"
        ? { preset: existing }
        : {};
    if (!assignNestedConfigValue(node, parts.slice(1), value)) {
      return existing;
    }
    return node;
  });
}

/** Value shown for a config item given its stored value. */
export function displayValue(item: ConfigItem, value: ConfigValue): string {
  const effective = value ?? item.defaultValue ?? null;
  if (effective === null || effective === "") {
    return item.kind === "toggle" ? tr("config.off", "off") : tr("config.empty", "—");
  }
  if (item.kind === "toggle") {
    return effective === true ? tr("config.on", "on") : tr("config.off", "off");
  }
  return String(effective);
}

/** Next stored boolean after toggling `item` from its current effective value. */
export function nextToggleValue(item: ConfigItem, value: ConfigValue): boolean {
  const effective = value ?? item.defaultValue ?? false;
  return effective !== true;
}

export type CoerceResult =
  | { ok: true; value: ConfigValue }
  | { ok: false; reason: string };

/**
 * Turn typed input into a storable value, refusing bad input with a reason
 * instead of silently keeping the previous value. The operator sees *why* the
 * edit did nothing — which is the whole point of returning a reason.
 */
export function coerceConfigValue(
  item: ConfigItem,
  current: ConfigValue,
  next: string,
): CoerceResult {
  const trimmed = next.trim();

  if (item.kind === "number") {
    if (trimmed === "") return { ok: true, value: null };
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      return {
        ok: false,
        reason: tr(
          "config.nan",
          '{label}: "{given}" is not a number — nothing written.',
          { label: settingLabel(item), given: trimmed },
        ),
      };
    }
    if (!explainSettingValue(item, parsed).ok) {
      return {
        ok: false,
        reason:
          validationProblem(
            item,
            parsed,
            effectiveSettingValue(item, current),
          ) ?? "",
      };
    }
    return { ok: true, value: parsed };
  }

  if (item.kind === "text") return { ok: true, value: trimmed };

  if (!explainSettingValue(item, trimmed).ok) {
    return {
      ok: false,
      reason:
        validationProblem(item, trimmed, effectiveSettingValue(item, current)) ??
        "",
    };
  }
  return { ok: true, value: trimmed };
}
