import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { MOTION_CATALOG } from "../../../motion/catalog.ts";
import { STRUCTURAL_PRESET_NAMES } from "../../../config/types.ts";
import { PRESETS } from "../../../config/presets.ts";
import { config } from "../../core/state.ts";
import type { PowerlineShortcuts } from "../../core/types.ts";
import { DEFAULT_MOTION_POLICY, type MotionPolicy } from "../../../motion/types.ts";
import { detectTerminalCapabilities } from "../../../theme/detect.ts";
import { DECK_ROUTE_DEFS, filterDeckRoutes } from "./routes.ts";
import { renderAppearanceBody, renderMotionGalleryBody } from "./appearance.ts";
import { renderSkillWorkbench, type WorkbenchSkill } from "../../skills/workbench.ts";
import {
  defaultAppearanceState,
  defaultSkillsState,
  normalizeDeckNavState,
  type DeckNavState,
  type DeckRoute,
  type DeckSessionSnapshot,
} from "./types.ts";

export { filterDeckRoutes };

function bar(percent: number, width: number): string {
  const filled = Math.round((Math.max(0, Math.min(100, percent)) / 100) * width);
  return `${"█".repeat(filled)}${"░".repeat(Math.max(0, width - filled))}`;
}

function routeTitle(route: DeckRoute): string {
  return DECK_ROUTE_DEFS.find((entry) => entry.id === route)?.label ?? "Home";
}

export function renderDeckFrame(
  theme: Theme,
  width: number,
  snapshot: DeckSessionSnapshot,
  state: DeckNavState,
  shortcuts: PowerlineShortcuts,
  policy: MotionPolicy = DEFAULT_MOTION_POLICY,
): string[] {
  const nav = normalizeDeckNavState(state);
  if (policy.screenReader) {
    return [
      `Wishcraft Deck. Route: ${routeTitle(nav.route)}. Model ${snapshot.modelLabel}. Branch ${snapshot.branchLabel}. Context ${snapshot.contextPercent} percent. Activity ${snapshot.signalActivity}.`,
    ];
  }
  const inner = Math.max(40, width - 2);
  const border = (text: string) => theme.fg("dim", text);
  const wrap = (text: string) =>
    `${border("│")}${truncateToWidth(text, inner, "…", true)}${border("│")}`;

  const leftW = Math.max(14, Math.floor(inner * 0.18));
  const rightW = Math.max(18, Math.floor(inner * 0.24));
  const centerW = Math.max(20, inner - leftW - rightW - 4);

  const header = ` ◈ ${snapshot.modelLabel}   ${snapshot.branchLabel}   context ${snapshot.contextPercent}%   ${snapshot.signalActivity.toUpperCase()} `;
  const lines: string[] = [];
  lines.push(border(`╭${"─".repeat(inner)}╮`));
  lines.push(wrap(theme.fg("accent", theme.bold(truncateToWidth(header, inner, "…", true)))));
  lines.push(border(`├${"─".repeat(inner)}┤`));

  const rail = navLines(snapshot, nav, theme, leftW);
  const center = centerRouteBody(snapshot, nav, theme, centerW, shortcuts);
  const right = rightRail(snapshot, theme, rightW);

  const rowCount = Math.max(rail.length, center.length, right.length, 8);
  for (let i = 0; i < rowCount; i++) {
    const left = padCol(rail[i] ?? "", leftW);
    const mid = padCol(center[i] ?? "", centerW);
    const rightCol = padCol(right[i] ?? "", rightW);
    lines.push(wrap(`${left} ${mid} ${rightCol}`));
  }

  lines.push(border(`├${"─".repeat(inner)}┤`));
  const footer = nav.searchOpen
    ? `/ ${nav.searchQuery}_`
    : `/ Search   g h Home   g s Signal   g i Ideas   ? Help   Esc Close`;
  lines.push(wrap(theme.fg("dim", truncateToWidth(footer, inner, "…", true))));
  lines.push(border(`╰${"─".repeat(inner)}╯`));
  return lines;
}

function navLines(
  snapshot: DeckSessionSnapshot,
  state: DeckNavState,
  theme: Theme,
  width: number,
): string[] {
  const lines: string[] = [theme.fg("accent", "NAVIGATION")];
  for (const route of DECK_ROUTE_DEFS) {
    const active = route.id === state.route;
    const marker = active ? "◉" : "◇";
    let suffix = "";
    if (route.id === "skills") suffix = ` ${snapshot.skillsTotal}`;
    if (route.id === "ideas") suffix = ` ${snapshot.ideaCount}`;
    lines.push(
      theme.fg(
        active ? "accent" : "muted",
        truncateToWidth(`${marker} ${route.label}${suffix}`, width, "…", true),
      ),
    );
  }
  return lines;
}

function centerRouteBody(
  snapshot: DeckSessionSnapshot,
  state: DeckNavState,
  theme: Theme,
  width: number,
  shortcuts: PowerlineShortcuts,
): string[] {
  const title = theme.fg("accent", `ACTIVE ROUTE: ${routeTitle(state.route).toUpperCase()}`);
  const body: string[] = [title, ""];
  switch (state.route) {
    case "home":
      body.push(theme.fg("text", "CURRENT SESSION"));
      body.push(
        theme.fg(
          "accent",
          truncateToWidth(`◆ ${snapshot.signalActivity}`, width, "…", true),
        ),
      );
      body.push(
        truncateToWidth(
          `${bar(snapshot.contextPercent, Math.min(18, width - 12))} ${snapshot.contextPercent}% (${formatK(snapshot.contextTokens)} / ${formatK(snapshot.contextWindow)})`,
          width,
          "…",
          true,
        ),
      );
      body.push("");
      body.push(theme.fg("text", "NEXT INTENT"));
      body.push(
        truncateToWidth(snapshot.nextIntent ?? "No queued intent", width, "…", true),
      );
      break;
    case "signal":
      body.push(`Preset layout: ${config.preset}`);
      body.push(`Placement: ${config.placement}`);
      body.push(`Motion: ${snapshot.signalMotion}`);
      body.push(`Activity: ${snapshot.signalActivity}`);
      body.push("Use /signal preset · placement · doctor");
      break;
    case "skills": {
      const skills: WorkbenchSkill[] = (snapshot.skillSummaries ?? []).map((entry) => ({
        name: entry.name,
        description: entry.description,
        category: entry.category,
        warning: entry.warning,
        usageCount: entry.usageCount,
        usageSeries: entry.usageSeries,
        health: entry.health ?? (entry.warning ? "warn" : "ok"),
        bodyPreview: entry.bodyPreview,
        triggers: entry.triggers,
        filePath: entry.filePath,
      }));
      const skillsState = state.skills ?? defaultSkillsState();
      body.push(
        ...renderSkillWorkbench(
          theme,
          width,
          skills,
          skillsState.selected,
          skillsState.wizardOpen ? skillsState.wizard ?? null : null,
        ),
      );
      break;
    }
    case "ideas":
      body.push(`${snapshot.ideaCount} ideas · ${snapshot.queueCount} queued`);
      body.push("Capture with queue sigil or /ideas");
      break;
    case "guardrails":
      body.push(
        `Policy: ${snapshot.policyEnabled ? "ENABLED" : "OFF"} (${snapshot.policyRuleCount} rules)`,
      );
      body.push("Edit rules under wishcraft.policy in settings");
      break;
    case "shell":
      body.push(`Bash mode: ${snapshot.bashModeActive ? "on" : "off"}`);
      body.push(`Shell: ${snapshot.shellName ?? "not started"}`);
      body.push("Toggle with /bash-mode");
      break;
    case "usage":
      body.push(
        `Context ${snapshot.contextPercent}% · ${formatK(snapshot.contextTokens)} tokens`,
      );
      body.push("Open /usage for detailed overlay");
      break;
    case "appearance":
      body.push(
        ...renderAppearanceBody(
          theme,
          width,
          state.appearance ?? defaultAppearanceState(),
          config.appearance,
        ),
      );
      break;
    case "motion":
      body.push(
        ...renderMotionGalleryBody(
          theme,
          width,
          state.appearance ?? defaultAppearanceState(),
        ),
      );
      break;
    case "shortcuts":
      body.push(`Menu: ${shortcuts.menu ?? "alt+p"}`);
      body.push(`Queue: ${shortcuts.queueOpen ?? "ctrl+alt+q"}`);
      body.push(`Info: ${shortcuts.info ?? "alt+i"}`);
      body.push("g <key> jumps inside the Deck");
      break;
    case "diagnostics": {
      const caps = snapshot.terminal ?? {
        term: detectTerminalCapabilities().term || "unknown",
        noColor: false,
        truecolor: false,
        lowColor: false,
        screenReader: false,
        reducedMotion: false,
        motionLevel: "full",
      };
      body.push(`TERM ${caps.term || "unset"}`);
      body.push(`truecolor ${caps.truecolor ? "yes" : "no"} ·  NO_COLOR ${caps.noColor ? "yes" : "no"}`);
      body.push(`low-color ${caps.lowColor ? "yes" : "no"} · screen reader ${caps.screenReader ? "yes" : "no"}`);
      body.push(`reduced-motion ${caps.reducedMotion ? "yes" : "no"} · level ${caps.motionLevel}`);
      body.push(`Catalog ${MOTION_CATALOG.length} · presets ${STRUCTURAL_PRESET_NAMES.length}`);
      break;
    }
  }
  return body.map((line) => truncateToWidth(line, width, "…", true));
}

function rightRail(snapshot: DeckSessionSnapshot, theme: Theme, width: number): string[] {
  const lines = [theme.fg("accent", "ACTIVITY FEED"), ""];
  if (snapshot.recentActivity.length === 0) {
    lines.push(theme.fg("muted", "No recent activity"));
  } else {
    for (const item of snapshot.recentActivity) {
      lines.push(truncateToWidth(`· ${item}`, width, "…", true));
    }
  }
  lines.push("");
  lines.push(theme.fg("accent", "SKILLS HEALTH"));
  lines.push(`✓ ${snapshot.skillsTotal - snapshot.skillsWarnings} healthy`);
  if (snapshot.skillsWarnings > 0) {
    lines.push(theme.fg("warning", `! ${snapshot.skillsWarnings} warnings`));
  }
  lines.push("");
  lines.push(theme.fg("accent", "GUARDRAILS"));
  lines.push(
    truncateToWidth(
      `Policy: ${snapshot.policyEnabled ? "ON" : "OFF"} (${snapshot.policyRuleCount})`,
      width,
      "…",
      true,
    ),
  );
  return lines;
}

function padCol(text: string, width: number): string {
  return truncateToWidth(text, width, "…", true);
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function formatK(value: number): string {
  if (value >= 1000) return `${Math.round(value / 1000)}k`;
  return String(value);
}

export function layoutPresetNames(): string[] {
  return Object.keys(PRESETS);
}
