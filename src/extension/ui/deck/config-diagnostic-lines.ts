/**
 * Deck body renderer for the config diagnosis section.
 *
 * Sectioned (sources → conflicts → unknown keys → settings) so the whole
 * picture fits one screen: the operator can see which settings.json is
 * winning, what is shadowed, what looks like a typo, and how many stored
 * values are being discarded.
 *
 * Kept separate from `route-bodies.ts` so that file stays about the route's
 * interactive content; this one is a pure report → lines projection.
 */
import { truncateToWidth } from "@earendil-works/pi-tui";

import { tr } from "../../../i18n/index.ts";
import { getCachedConfigDiagnostics } from "../../settings/config-diagnostics.ts";

const MAX_LINES = 16;
const MAX_CONFLICTS = 3;
const MAX_UNKNOWN = 3;
const MAX_INVALID = 4;

const MARK: Record<"ok" | "warn" | "fail", string> = {
  ok: "✓",
  warn: "!",
  fail: "✗",
};

/** Localised heading for the config diagnosis block. */
export function configDiagnosticTitle(): string {
  return tr("diag.title", "Config diagnosis");
}

function heading(title: string): string {
  return `── ${title} ──`;
}

function fit(text: string, width: number): string {
  return truncateToWidth(text, width, "…", true);
}

/**
 * Render the diagnosis as padded one-liners. Uses the memoised report, so
 * calling this from the Deck's render loop is cheap after the first frame.
 */
export function configDiagnosticLines(cwd: string, width: number): string[] {
  const report = getCachedConfigDiagnostics(cwd);
  const lines: string[] = [
    fit(
      `${configDiagnosticTitle()} — ${tr("diag.subheading", "where every value comes from")}`,
      width,
    ),
    "",
  ];

  lines.push(heading(tr("diag.sources", "Sources")));
  for (const file of report.files) {
    const scope = tr(
      file.scope === "global" ? "diag.globalFile" : "diag.projectFile",
      file.scope === "global" ? "global" : "project",
    );
    if (!file.exists) {
      lines.push(
        fit(
          `✓ ${scope}: ${tr("diag.fileMissing", "not present (defaults in use)")}`,
          width,
        ),
      );
    } else if (!file.validJson) {
      lines.push(
        fit(
          `✗ ${scope}: ${tr("diag.fileInvalid", "INVALID JSON — ignored")}${file.error ? ` (${file.error})` : ""}`,
          width,
        ),
      );
    } else {
      lines.push(
        fit(
          `✓ ${scope}: ${tr("diag.fileValid", "valid JSON")} (${file.keyCount})`,
          width,
        ),
      );
    }
  }

  lines.push(heading(tr("diag.conflicts", "Conflicts")));
  if (report.conflicts.length === 0) {
    lines.push(tr("diag.noConflicts", "no conflicts"));
  } else {
    for (const conflict of report.conflicts.slice(0, MAX_CONFLICTS)) {
      lines.push(
        fit(
          `! ${conflict.path}: ${conflict.globalValue} → ${conflict.projectValue}`,
          width,
        ),
      );
    }
    if (report.conflicts.length > MAX_CONFLICTS) {
      lines.push(
        tr("diag.more", "… {n} more — run /wishcraft doctor", {
          n: report.conflicts.length - MAX_CONFLICTS,
        }),
      );
    }
  }

  lines.push(heading(tr("diag.unknownKeys", "Unknown keys")));
  if (report.unknownKeys.length === 0) {
    lines.push(tr("diag.noUnknown", "no unknown keys"));
  } else {
    for (const unknown of report.unknownKeys.slice(0, MAX_UNKNOWN)) {
      lines.push(
        unknown.suggestion
          ? fit(
              `! ${unknown.path} → ${tr("diag.didYouMean", "did you mean")} ${unknown.suggestion}?`,
              width,
            )
          : fit(
              `! ${unknown.path} — ${tr("diag.notRead", "no reader consumes this key")}`,
              width,
            ),
      );
    }
    if (report.unknownKeys.length > MAX_UNKNOWN) {
      lines.push(
        tr("diag.more", "… {n} more — run /wishcraft doctor", {
          n: report.unknownKeys.length - MAX_UNKNOWN,
        }),
      );
    }
  }

  lines.push(heading(tr("diag.settings", "Settings")));
  lines.push(
    fit(
      tr(
        "diag.summary",
        "{total} settings · {stored} stored · {defaulted} default · {invalid} invalid",
        report.counts,
      ),
      width,
    ),
  );
  const invalidRows = report.settings.filter((row) => row.problem !== null);
  for (const row of invalidRows.slice(0, MAX_INVALID)) {
    lines.push(fit(`! ${row.path}: ${row.problem}`, width));
  }

  if (lines.length > MAX_LINES) {
    const overflow = lines.length - MAX_LINES;
    return [
      ...lines.slice(0, MAX_LINES),
      tr("diag.more", "… {n} more — run /wishcraft doctor", { n: overflow }),
    ];
  }
  return lines;
}
