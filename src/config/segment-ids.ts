import { isRecord, normalizeCustomItemId } from "./primitives.ts";
import { BUILTIN_STATUS_LINE_SEGMENT_IDS } from "./types.ts";
import type {
  CustomStatusItem,
  StatusLineLayout,
  StatusLineSegmentId,
} from "./types.ts";

const BUILTIN_STATUS_LINE_SEGMENT_ID_SET = new Set<string>(
  BUILTIN_STATUS_LINE_SEGMENT_IDS,
);

export function normalizeStatusLineSegmentId(
  value: unknown,
  customItemIds: ReadonlySet<string>,
  customSegmentIds: ReadonlySet<string> = new Set(),
): StatusLineSegmentId | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim();
  if (BUILTIN_STATUS_LINE_SEGMENT_ID_SET.has(normalized)) {
    return normalized as StatusLineSegmentId;
  }

  const customId = normalized.startsWith("custom:")
    ? normalizeCustomItemId(normalized.slice("custom:".length))
    : null;
  // ponytail: custom: ids resolve to either a user-defined item OR a computed segment
  return customId &&
    (customItemIds.has(customId) || customSegmentIds.has(customId))
    ? `custom:${customId}`
    : null;
}

export function normalizeDisabledSegments(
  raw: unknown,
  customItems: readonly CustomStatusItem[],
  customSegmentIds: ReadonlySet<string>,
): {
  disabledSegments: StatusLineSegmentId[];
  invalidDisabledSegments: string[];
} {
  if (!Array.isArray(raw))
    return { disabledSegments: [], invalidDisabledSegments: [] };

  const disabledSegments: StatusLineSegmentId[] = [];
  const invalidDisabledSegments: string[] = [];
  const customItemIds = new Set(customItems.map((item) => item.id));
  const seen = new Set<StatusLineSegmentId>();

  for (const entry of raw) {
    const segmentId = normalizeStatusLineSegmentId(
      entry,
      customItemIds,
      customSegmentIds,
    );
    if (!segmentId) {
      invalidDisabledSegments.push(
        typeof entry === "string" ? entry.trim() : String(entry),
      );
    } else if (!seen.has(segmentId)) {
      seen.add(segmentId);
      disabledSegments.push(segmentId);
    }
  }

  return { disabledSegments, invalidDisabledSegments };
}

export function normalizeLayout(
  raw: unknown,
  customItems: readonly CustomStatusItem[],
  customSegmentIds: ReadonlySet<string>,
): { layout: StatusLineLayout | null; invalidLayoutSegments: string[] } {
  if (!isRecord(raw)) return { layout: null, invalidLayoutSegments: [] };

  const layout: StatusLineLayout = {};
  const invalidLayoutSegments: string[] = [];
  const customItemIds = new Set(customItems.map((item) => item.id));
  const globallyPlaced = new Set<StatusLineSegmentId>();

  for (const row of ["left", "right", "secondary"] as const) {
    const entries = raw[row];
    if (!Array.isArray(entries)) continue;

    const segments: StatusLineSegmentId[] = [];
    const seen = new Set<StatusLineSegmentId>();
    for (const entry of entries) {
      const segmentId = normalizeStatusLineSegmentId(
        entry,
        customItemIds,
        customSegmentIds,
      );
      if (!segmentId) {
        invalidLayoutSegments.push(
          `${row}:${typeof entry === "string" ? entry.trim() : String(entry)}`,
        );
      } else if (!seen.has(segmentId)) {
        seen.add(segmentId);
        if (globallyPlaced.has(segmentId)) {
          invalidLayoutSegments.push(`${row}:${segmentId}`);
        } else {
          globallyPlaced.add(segmentId);
          segments.push(segmentId);
        }
      }
    }
    layout[row] = segments;
  }

  return Object.keys(layout).length > 0
    ? { layout, invalidLayoutSegments }
    : { layout: null, invalidLayoutSegments };
}
