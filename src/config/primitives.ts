import type {
  ColorValue,
  CustomItemPosition,
  PowerlinePlacement,
  StatusLinePreset,
  StatusLineSeparatorStyle,
} from "./types.ts";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizePreset(
  value: unknown,
  presets: readonly StatusLinePreset[],
): StatusLinePreset | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return (presets as readonly string[]).includes(normalized)
    ? (normalized as StatusLinePreset)
    : null;
}

export function normalizePlacement(value: unknown): {
  placement: PowerlinePlacement;
  invalidPlacement: string | null;
} {
  if (value === undefined)
    return { placement: "above", invalidPlacement: null };

  const normalized =
    typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "above" || normalized === "below") {
    return { placement: normalized, invalidPlacement: null };
  }

  return {
    placement: "above",
    invalidPlacement: typeof value === "string" ? value.trim() : String(value),
  };
}

export const SEPARATOR_STYLES = [
  "powerline",
  "powerline-thin",
  "slash",
  "pipe",
  "block",
  "none",
  "ascii",
  "dot",
  "chevron",
  "star",
] as const satisfies readonly StatusLineSeparatorStyle[];

export function normalizeSeparator(
  value: unknown,
): StatusLineSeparatorStyle | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return (SEPARATOR_STYLES as readonly string[]).includes(normalized)
    ? (normalized as StatusLineSeparatorStyle)
    : null;
}

export function normalizeCustomItemId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return /^[a-zA-Z0-9_-]+$/.test(normalized) ? normalized : null;
}

export function normalizeCustomItemPosition(
  value: unknown,
): CustomItemPosition {
  if (value === "left" || value === "right" || value === "secondary")
    return value;
  return "right";
}

export function normalizeCustomColor(value: unknown): ColorValue | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? (normalized as ColorValue) : undefined;
}

export function normalizeCustomPrefix(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

export function normalizeCaptureSigil(value: unknown): string | false {
  if (value === false) return false;
  if (typeof value !== "string") return "#";
  const normalized = value.trim();
  return normalized && !/\s/.test(normalized) ? normalized : "#";
}

export function normalizeRetentionHours(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 24;
  return Math.min(24 * 365, Math.max(1, Math.floor(value)));
}

export function normalizeCostAlert(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.round(value * 100) / 100;
}

export function normalizeCustomSegmentType(
  value: unknown,
): "command" | "env" | "static" | null {
  if (value === "command" || value === "env" || value === "static")
    return value;
  return null;
}

export function normalizeSegmentLabels(raw: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!isRecord(raw)) return result;
  for (const [id, label] of Object.entries(raw)) {
    if (typeof label === "string" && label.trim()) {
      result[id] = label.trim();
    }
  }
  return result;
}
