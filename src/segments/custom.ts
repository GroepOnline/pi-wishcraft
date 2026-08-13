import { execSync } from "node:child_process";
import type {
  CustomSegmentConfig,
  RenderedSegment,
  SegmentContext,
  StatusLineSegment,
  StatusLineSegmentId,
} from "../config/types.ts";
import { normalizeExtensionStatusValue } from "../config/powerline-config.ts";
import { applyColor } from "../theme/theme.ts";
import { SEP_DOT } from "../theme/icons.ts";

// User-defined computed segments (command/env/static), registered at config time.
export const customComputedSegments = new Map<string, StatusLineSegment>();
const commandCache = new Map<string, { at: number; value: string }>();

function runCommandCached(
  command: string,
  cacheMs: number | undefined,
): string | null {
  // ponytail: simple in-memory cache keyed by command; avoids re-spawning shells every paint
  const now = Date.now();
  const cached = commandCache.get(command);
  if (cached && cacheMs !== undefined && now - cached.at < cacheMs)
    return cached.value;
  try {
    // Bound user command segments: a hung/long-running command must not wedge
    // the extension's event loop, and large output is truncated.
    const out = execSync(command, {
      encoding: "utf8",
      timeout: 5000,
      maxBuffer: 1024 * 1024,
    }).trim();
    if (cacheMs !== undefined)
      commandCache.set(command, { at: now, value: out });
    return out;
  } catch {
    return null;
  }
}

function makeComputedSegment(
  id: string,
  def: CustomSegmentConfig,
): StatusLineSegment {
  return {
    id: `custom:${id}` as StatusLineSegmentId,
    render(ctx: SegmentContext): RenderedSegment {
      let text = "";
      if (def.type === "command") {
        const out = runCommandCached(def.command, def.cacheMs);
        if (out === null) return { content: "", visible: false };
        text = out;
      } else if (def.type === "env") {
        const val = process.env[def.env];
        if (!val) {
          if (def.fallback === undefined)
            return { content: "", visible: false };
          text = def.fallback;
        } else {
          text = val;
        }
      } else {
        text = def.text;
      }

      if (!text) return { content: "", visible: false };

      let content = text;
      if (def.prefix) content = `${def.prefix}${SEP_DOT}${content}`;
      if (def.color) content = applyColor(ctx.theme, def.color, content);
      return { content, visible: true };
    },
  };
}

/** Register user-defined computed segments from settings. Replaces any previously registered. */
export function registerCustomSegments(
  defs: Record<string, CustomSegmentConfig>,
): void {
  customComputedSegments.clear();
  for (const [id, def] of Object.entries(defs)) {
    customComputedSegments.set(id, makeComputedSegment(id, def));
  }
}

export function renderCustomSegment(
  id: `custom:${string}`,
  ctx: SegmentContext,
): RenderedSegment {
  const customItemId = id.slice("custom:".length);
  const custom = ctx.customItemsById.get(customItemId);
  if (!custom) return { content: "", visible: false };

  const rawStatus = ctx.extensionStatuses.get(custom.statusKey);
  const normalizedStatus = rawStatus
    ? normalizeExtensionStatusValue(rawStatus)
    : null;
  if (!normalizedStatus) {
    return custom.hideWhenMissing
      ? { content: "", visible: false }
      : { content: custom.prefix ?? custom.id, visible: true };
  }

  let content = normalizedStatus;
  if (custom.prefix) {
    content = `${custom.prefix}${SEP_DOT}${content}`;
  }
  if (custom.color) {
    content = applyColor(ctx.theme, custom.color, content);
  }

  return { content, visible: true };
}

export function isCustomSegmentId(
  id: StatusLineSegmentId,
): id is `custom:${string}` {
  return id.startsWith("custom:");
}
