import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import type { SelectItem } from "@earendil-works/pi-tui";

import { PRESETS } from "../../config/presets.ts";
import {
  getProjectSettingsPath,
  getSettingsPath,
  readSettings,
} from "../settings/settings-io.ts";
import { getQueueStorePaths } from "../../../queue/store.ts";
import { hasNerdFonts } from "../../theme/icons.ts";
import { config } from "../core/state.ts";
import type { RuntimeState } from "../core/types.ts";
import { showSelectOverlay } from "../ui/menu-views.ts";

export type DoctorStatus = "ok" | "warn" | "fail";

export interface DoctorCheck {
  status: DoctorStatus;
  name: string;
  detail: string;
}

function settingsFileHealth(path: string): DoctorStatus {
  if (!existsSync(path)) return "warn";
  try {
    JSON.parse(readFileSync(path, "utf-8"));
    return "ok";
  } catch {
    return "fail";
  }
}

function gitPollingMode(): string {
  const polling = config.segmentOptions?.git?.polling;
  if (polling === "branch") return "branch-only";
  if (polling === "off") return "off";
  return "full";
}

/**
 * Build the diagnostic report for `/powerline doctor`. Pure-ish: reads the
 * filesystem/env for the checks, but performs no UI and never mutates state,
 * so it can be unit-tested headlessly.
 */
export function buildDoctorReport(
  rt: RuntimeState,
  ctx: any,
): DoctorCheck[] {
  const cwd = ctx.cwd ?? process.cwd();
  const checks: DoctorCheck[] = [];

  // ── Settings ─────────────────────────────────────────────────────────────
  const globalPath = getSettingsPath();
  const projectPath = getProjectSettingsPath(cwd);
  const globalHealth = settingsFileHealth(globalPath);
  checks.push({
    status: globalHealth,
    name: "settings.global",
    detail:
      globalHealth === "fail"
        ? `invalid JSON at ${globalPath}`
        : globalHealth === "warn"
          ? `not found (defaults in use) — ${globalPath}`
          : `valid — ${globalPath}`,
  });

  const projectHealth = settingsFileHealth(projectPath);
  checks.push({
    status: projectHealth,
    name: "settings.project",
    detail:
      projectHealth === "fail"
        ? `invalid JSON at ${projectPath}`
        : projectHealth === "warn"
          ? "not present (global settings only)"
          : `valid — ${projectPath}`,
  });

  const mergedSettings = readSettings(cwd);
  const hasPowerlineKey =
    typeof mergedSettings.powerline === "object" &&
    mergedSettings.powerline !== null;
  checks.push({
    status: hasPowerlineKey ? "ok" : "warn",
    name: "settings.powerline",
    detail: hasPowerlineKey
      ? "powerline key present"
      : "no powerline key — defaults in use",
  });

  // ── Config validity ──────────────────────────────────────────────────────
  const invalidEntries: string[] = [];
  if (config.invalidPlacement)
    invalidEntries.push(`placement "${config.invalidPlacement}"`);
  for (const id of config.invalidDisabledSegments)
    invalidEntries.push(`disabledSegment "${id}"`);
  for (const id of config.invalidLayoutSegments)
    invalidEntries.push(`layout "${id}"`);
  checks.push({
    status: invalidEntries.length > 0 ? "warn" : "ok",
    name: "config",
    detail:
      invalidEntries.length > 0
        ? `ignored: ${invalidEntries.join(", ")}`
        : `no invalid entries (preset: ${config.preset})`,
  });

  const rawPowerline = mergedSettings.powerline;
  const requestedPreset =
    typeof rawPowerline === "object" &&
    rawPowerline !== null &&
    typeof (rawPowerline as Record<string, unknown>).preset === "string"
      ? ((rawPowerline as Record<string, unknown>).preset as string).trim()
      : null;
  const customPresetNames = Object.keys(config.presets);
  const unknownPreset =
    requestedPreset &&
    !Object.prototype.hasOwnProperty.call(PRESETS, requestedPreset) &&
    !customPresetNames.includes(requestedPreset)
      ? requestedPreset
      : null;
  checks.push({
    status: unknownPreset ? "warn" : "ok",
    name: "preset",
    detail: unknownPreset
      ? `unknown preset "${unknownPreset}" — using ${config.preset}`
      : `active: ${config.preset}`,
  });

  // ── Nerd Fonts ───────────────────────────────────────────────────────────
  const override = process.env.POWERLINE_NERD_FONTS;
  const termProgram = process.env.TERM_PROGRAM || "";
  let nerdReason = "";
  if (override === "1") nerdReason = "forced via POWERLINE_NERD_FONTS=1";
  else if (override === "0") nerdReason = "POWERLINE_NERD_FONTS=0 forces ASCII";
  else if (process.env.GHOSTTY_RESOURCES_DIR)
    nerdReason = "Ghostty detected";
  else if (termProgram) nerdReason = `TERM_PROGRAM=${termProgram}`;
  else nerdReason = "no known Nerd Font terminal detected";
  checks.push({
    status: hasNerdFonts() ? "ok" : "warn",
    name: "nerd-fonts",
    detail: hasNerdFonts()
      ? `enabled (${nerdReason})`
      : `disabled — ASCII glyphs (${nerdReason})`,
  });

  // ── Git ──────────────────────────────────────────────────────────────────
  const gitProbe = spawnSync("git", ["--version"], {
    encoding: "utf8",
    timeout: 2000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (gitProbe.error || gitProbe.status !== 0) {
    checks.push({
      status: "fail",
      name: "git",
      detail: "git binary not found — git segment cannot poll",
    });
  } else {
    const repoProbe = spawnSync(
      "git",
      ["rev-parse", "--is-inside-work-tree"],
      {
        cwd,
        encoding: "utf8",
        timeout: 2000,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    checks.push({
      status: repoProbe.status === 0 ? "ok" : "warn",
      name: "git",
      detail:
        repoProbe.status === 0
          ? `polling: ${gitPollingMode()} — inside a git repo`
          : `polling: ${gitPollingMode()} — not a git repo (segment hidden)`,
    });
  }

  // ── Bash shell ───────────────────────────────────────────────────────────
  const shell = rt.shellSession?.state;
  const transcript = rt.bashTranscript.getSnapshot();
  checks.push({
    status: "ok",
    name: "bash",
    detail: rt.bashModeActive
      ? `active — shell ${shell?.running ? "running" : "idle"}${shell?.shellName ? ` (${shell.shellName})` : ""}, transcript ${transcript.totalLines} lines`
      : `inactive (ctrl+shift+b) — transcript ${transcript.totalLines} lines`,
  });

  // ── Queue store files ────────────────────────────────────────────────────
  const { inboxPath, aliasesPath, archivePath } = getQueueStorePaths();
  let malformed = 0;
  let totalLines = 0;
  if (existsSync(inboxPath)) {
    for (const line of readFileSync(inboxPath, "utf-8").split("\n")) {
      if (!line.trim()) continue;
      totalLines += 1;
      try {
        JSON.parse(line);
      } catch {
        malformed += 1;
      }
    }
  }
  const staleLock = existsSync(`${inboxPath}.lock`);
  const aliasesHealth = settingsFileHealth(aliasesPath);
  const queueDetail = staleLock
    ? `stale lock at ${inboxPath}.lock — a crashed writer may hold it`
    : malformed > 0
      ? `${malformed} malformed line${malformed === 1 ? "" : "s"} in inbox.jsonl (${totalLines} total)`
      : totalLines === 0
        ? "no items yet"
        : `${totalLines} item${totalLines === 1 ? "" : "s"} in inbox.jsonl`;
  checks.push({
    status: staleLock || malformed > 0 || aliasesHealth === "fail"
      ? "fail"
      : "ok",
    name: "queue",
    detail: `${queueDetail}${aliasesHealth === "fail" ? ` — projects.json is invalid JSON` : ""}${existsSync(archivePath) ? ` — archive present` : ""}`,
  });

  return checks;
}

/** Render the doctor report as a scrollable overlay; enter copies a line. */
export async function runPowerlineDoctor(
  rt: RuntimeState,
  ctx: any,
): Promise<void> {
  const checks = buildDoctorReport(rt, ctx);
  const items: SelectItem[] = checks.map((check) => ({
    label: `${check.status === "ok" ? "[ok]  " : check.status === "warn" ? "[warn]" : "[fail]"} ${check.name} — ${check.detail}`,
    value: `${check.name}: ${check.detail}`,
  }));
  const picked = await showSelectOverlay(
    ctx,
    "Powerline doctor",
    "↑↓ navigate · enter copy · esc close",
    items,
    Math.min(items.length, 20),
  );
  if (picked) ctx.ui.notify(picked.value, "info");
}
