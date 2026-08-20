// ═══════════════════════════════════════════════════════════════════════════
// ChefGroep status bridge. Powerline publishes its own state under a stable
// `powerline.*` key set via `ctx.ui.setStatus`, so ChefBar and other
// extensions can read it without depending on powerline internals. These keys
// are hidden from powerline's own `extension_statuses` segment.
// ═══════════════════════════════════════════════════════════════════════════

export const POWERLINE_STATUS_KEYS = {
  preset: "powerline.preset",
  tps: "powerline.tps",
  ports: "powerline.ports",
} as const;

/** Keys never rendered in powerline's own bar (they exist for other extensions). */
export const HIDDEN_POWERLINE_STATUS_KEYS: ReadonlySet<string> = new Set(
  Object.values(POWERLINE_STATUS_KEYS),
);

export interface PowerlineStatusSnapshot {
  /** Active preset name. */
  preset?: string;
  /** `POWERLINE_TPS` override; `undefined` clears it (back to live rate). */
  tps?: string | undefined;
  /** open_ports count as text (`?` when a fleet host probe failed). */
  ports?: string;
}

type StatusPublisherCtx = {
  ui?: { setStatus?: (key: string, value: string | undefined) => void };
};

/**
 * Pure: turn a partial snapshot into the exact `[statusKey, value]` writes to
 * make. Only keys present in the snapshot are emitted (using `in` so an
 * explicit `tps: undefined` still produces a clearing write).
 */
export function buildPowerlineStatusExport(
  snapshot: PowerlineStatusSnapshot,
): Array<[string, string | undefined]> {
  const entries: Array<[string, string | undefined]> = [];
  if ("preset" in snapshot) {
    entries.push([POWERLINE_STATUS_KEYS.preset, snapshot.preset]);
  }
  if ("tps" in snapshot) {
    entries.push([POWERLINE_STATUS_KEYS.tps, snapshot.tps]);
  }
  if ("ports" in snapshot) {
    entries.push([POWERLINE_STATUS_KEYS.ports, snapshot.ports]);
  }
  return entries;
}

/** Publish only the snapshot keys present, via `ctx.ui.setStatus`. */
export function publishPowerlineStatuses(
  ctx: StatusPublisherCtx | null | undefined,
  snapshot: PowerlineStatusSnapshot,
): void {
  const setStatus = ctx?.ui?.setStatus;
  if (!setStatus) return;
  for (const [key, value] of buildPowerlineStatusExport(snapshot)) {
    setStatus(key, value);
  }
}

/** Format a listening-port count for the status export (`?` when unknown). */
export function formatPortsStatusValue(count: number): string {
  return count < 0 ? "?" : String(count);
}
