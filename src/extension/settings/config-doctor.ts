/**
 * config-doctor.ts
 * ---------------------------------------------------------------------------
 * `/wishcraft doctor` — the configuration half of the diagnosis, as a
 * scrollable list. Complements `/signal doctor`, which reports on the
 * environment (git, fonts, queue files) rather than on settings.
 * ---------------------------------------------------------------------------
 */

import type { SelectItem } from "@earendil-works/pi-tui";

import type { RuntimeState } from "../core/types.ts";
import { tr } from "../../i18n/index.ts";
import { showSelectOverlay } from "../ui/menu-views.ts";
import {
  buildConfigDiagnostics,
  invalidateConfigDiagnosticsCache,
} from "./config-diagnostics.ts";

const MARK: Record<"ok" | "warn" | "fail", string> = {
  ok: "[ok]  ",
  warn: "[warn]",
  fail: "[fail]",
};

/** Project the report into copyable list items (pure, testable). */
export function configDoctorItems(
  report: ReturnType<typeof buildConfigDiagnostics>,
): SelectItem[] {
  return report.checks.map((check) => ({
    label: `${MARK[check.severity]} ${check.name} — ${check.detail}`,
    value: `${check.name}: ${check.detail}`,
  }));
}

/** Open the report as an overlay; enter copies the selected line. */
export async function runConfigDoctor(
  rt: RuntimeState,
  ctx: any,
): Promise<void> {
  const cwd = ctx.cwd ?? process.cwd();
  // The operator just came here because something looked wrong, so always
  // re-read rather than trusting the render-path memo.
  invalidateConfigDiagnosticsCache();
  const report = buildConfigDiagnostics(cwd);
  const items = configDoctorItems(report);

  const picked = await showSelectOverlay(
    ctx,
    tr("diag.title", "Config diagnosis"),
    tr("diag.doctorHint", "↑↓ navigate · enter copy · esc close"),
    items,
    Math.min(items.length, 22),
  );
  if (picked) ctx.ui.notify(picked.value, "info");
}
