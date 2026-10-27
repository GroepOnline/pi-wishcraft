import { exec } from "node:child_process";
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

/**
 * Cache window for a command segment when the operator did not set `cacheMs`.
 *
 * Without a default, every paint (~33ms while streaming) respawned the user's
 * shell. A command segment is a status line read, not a synchronous syscall —
 * 1s keeps it responsive without making it a busy loop.
 */
export const DEFAULT_COMMAND_CACHE_MS = 1000;
/** Floor/ceiling so a typo cannot pin a stale value forever or spin constantly. */
const MIN_COMMAND_CACHE_MS = 100;
const MAX_COMMAND_CACHE_MS = 300_000;
const COMMAND_TIMEOUT_MS = 5000;
const COMMAND_MAX_BUFFER = 1024 * 1024;
/** Truncate runaway output before it reaches the layout engine. */
const MAX_COMMAND_OUTPUT = 512;

interface CommandResult {
  at: number;
  value: string;
  /** Set when the command failed; rethrown on the next render. */
  failed: boolean;
}

const commandCache = new Map<string, CommandResult>();
const commandInFlight = new Set<string>();
const customListeners = new Set<() => void>();

/**
 * Subscribe to command-segment refreshes. The value a command segment renders
 * lands asynchronously now, so the status line needs a repaint hook to
 * replace the placeholder with real output.
 */
export function subscribeCustomSegmentUpdates(listener: () => void): () => void {
  customListeners.add(listener);
  return () => customListeners.delete(listener);
}

function notifyCustomUpdate(): void {
  for (const listener of customListeners) listener();
}

/**
 * Resolve once every in-flight command segment has finished. Used by tests to
 * observe the post-refresh render deterministically instead of sleeping.
 */
export async function settleCustomSegmentUpdates(): Promise<void> {
  // Each completion re-checks, so a command that spawns another still drains.
  for (let guard = 0; guard < 50 && commandInFlight.size > 0; guard++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** Clamp a configured `cacheMs` into a sane window, defaulting when unset. */
export function resolveCommandCacheMs(cacheMs: number | undefined): number {
  if (typeof cacheMs !== "number" || !Number.isFinite(cacheMs)) {
    return DEFAULT_COMMAND_CACHE_MS;
  }
  return Math.min(MAX_COMMAND_CACHE_MS, Math.max(MIN_COMMAND_CACHE_MS, Math.floor(cacheMs)));
}

function runCommandAsync(command: string): void {
  if (commandInFlight.has(command)) return;
  commandInFlight.add(command);
  void new Promise<string>((resolve, reject) => {
    exec(
      command,
      { encoding: "utf8", timeout: COMMAND_TIMEOUT_MS, maxBuffer: COMMAND_MAX_BUFFER },
      (error, stdout) => {
        if (error || typeof stdout !== "string") reject(error ?? new Error("no output"));
        else resolve(stdout);
      },
    );
  })
    .then((stdout) => {
      commandCache.set(command, {
        at: Date.now(),
        value: stdout.trim().slice(0, MAX_COMMAND_OUTPUT),
        failed: false,
      });
    })
    .catch(() => {
      // Remember the failure so the *next* render can throw and let
      // renderSegment isolate this segment with a visible fault marker.
      commandCache.set(command, { at: Date.now(), value: "", failed: true });
    })
    .finally(() => {
      commandInFlight.delete(command);
      notifyCustomUpdate();
    });
}

/**
 * Serve the last command output and schedule a background refresh.
 *
 * Never spawns from the render path: an `execSync` here blocked the event loop
 * for up to 5s per command segment per paint. Returns `null` while the first
 * run is still in flight (the segment renders nothing that frame rather than
 * blanking the line).
 */
function readCommandCached(
  command: string,
  cacheMs: number,
): string | null {
  const now = Date.now();
  const cached = commandCache.get(command);
  if (cached && now - cached.at < cacheMs) {
    if (cached.failed) throw new Error(`Command failed: ${command}`);
    return cached.value;
  }
  runCommandAsync(command);
  // Serve stale: a failed command keeps showing its last good value for one
  // frame instead of blanking, then faults on the next render.
  if (cached && !cached.failed) return cached.value;
  if (cached?.failed) throw new Error(`Command failed: ${command}`);
  return null;
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
        const out = readCommandCached(def.command, resolveCommandCacheMs(def.cacheMs));
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
