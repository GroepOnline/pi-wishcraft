import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { MOTION_CATALOG } from "../../../motion/catalog.ts";
import { appearanceDisplayName } from "../../../config/structural-presets.ts";
import { PRESETS } from "../../../config/presets.ts";
import { config } from "../../core/state.ts";
import type { PowerlineShortcuts } from "../../core/types.ts";
import type { ComposerDraft } from "../../../motion/composer.ts";
import { tr } from "../../../i18n/index.ts";
import { BUILTIN_DECK_ROUTE_DEFS, localizedRouteDefs } from "./routes.ts";
import { configDiagnosticLines } from "./config-diagnostic-lines.ts";
import { portsLines, deckPortsOptions } from "./route-bodies.ts";
import type { DeckNavState, DeckRoute, DeckSessionSnapshot } from "./types.ts";
import {
  appearanceLines,
  appearanceRailPreview,
  guardrailLines,
  ideasLines,
  motionGalleryLines,
  skillsWorkbenchLines,
} from "./route-bodies.ts";

/**
 * The Deck receives a width but no viewport height, so the frame bounds its own
 * body instead of trusting the terminal: a long ideas queue or a big guardrail
 * list used to grow the box past the screen. Clipping here means every route is
 * safe regardless of terminal size.
 */
const MAX_CENTER_ROWS = 16;
const MAX_RIGHT_ROWS = 16;

function clipBody(
  lines: string[],
  maxRows: number,
  tail: (overflow: number) => string,
): string[] {
  if (lines.length <= maxRows) return lines;
  return [...lines.slice(0, maxRows), tail(lines.length - maxRows)];
}

function bar(percent: number, width: number): string {
  const filled = Math.round((Math.max(0, Math.min(100, percent)) / 100) * width);
  return `${"█".repeat(filled)}${"░".repeat(Math.max(0, width - filled))}`;
}

function routeTitle(route: DeckRoute): string {
  return localizedRouteDefs().find((entry) => entry.id === route)?.label ?? "Home";
}

/** "ACTIVE ROUTE: HOME" → localised heading for the center pane. */
function routeHeading(route: DeckRoute): string {
  return tr("deck.activeRoute", "ACTIVE ROUTE: {route}", {
    route: routeTitle(route).toUpperCase(),
  });
}

export function deckFooter(state: DeckNavState): string {
  if (state.searchOpen) return `/ ${state.searchQuery}_`;
  if (state.composerOpen)
    return tr("deck.footer.composer", "←→ nudge · ↑↓ field · enter apply · esc back");
  if (state.skillWizard)
    return tr("deck.footer.wizard", "type · enter next · [ ] template · esc back");
  if (state.skillCreate)
    return tr("deck.footer.create", "type a name · enter create · esc cancel");
  // Nav column has focus: ↑↓ walks routes, → jumps back into the list.
  if (state.navMode)
    return tr("deck.footer.nav", "↑↓ route · → list · / Search · g h Home · Esc Close");
  switch (state.route) {
    case "appearance":
      return tr(
        "deck.footer.appearance",
        "↑↓ select base · enter apply · ←/tab nav · → list · / Search · Esc Close",
      );
    case "motion":
      return tr(
        "deck.footer.motion",
        "↑↓ motion · t event · e composer · enter apply · ←/tab nav · → list · Esc Close",
      );
    case "skills":
      return tr(
        "deck.footer.skills",
        "↑↓ skill · enter insert · n new · w wizard · / filter · ←/tab nav · → list · Esc Close",
      );
    case "ideas":
      return tr(
        "deck.footer.ideas",
        "↑↓ idea · enter status · / filter · ←/tab nav · → list · Esc Close",
      );
    case "ports":
      return tr(
        "deck.footer.ports",
        "↑↓ select · enter copy · r re-probe · / filter · ←/tab nav · Esc Close",
      );
    default:
      return tr(
        "deck.footer.default",
        "/ Search · g h Home · g s Signal · g i Ideas · ? Help · Esc Close",
      );
  }
}

export function renderDeckFrame(
  theme: Theme,
  width: number,
  snapshot: DeckSessionSnapshot,
  state: DeckNavState,
  shortcuts: PowerlineShortcuts,
  composer: ComposerDraft | null = null,
  tick = Date.now(),
): string[] {
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

  const nav = navLines(snapshot, state, theme, leftW, state.navMode);
  const center = clipBody(
    centerRouteBody(snapshot, state, theme, centerW, shortcuts, composer, tick, inner),
    MAX_CENTER_ROWS,
    (overflow) => tr("deck.moreRows", "… {n} more — ↑↓ to scroll", { n: overflow }),
  );
  const right = clipBody(
    rightRail(snapshot, theme, rightW),
    MAX_RIGHT_ROWS,
    (overflow) => tr("deck.moreHidden", "… {n} hidden", { n: overflow }),
  );

  const rowCount = Math.max(nav.length, center.length, right.length, 8);
  for (let i = 0; i < rowCount; i++) {
    const left = padCol(nav[i] ?? "", leftW);
    const mid = padCol(center[i] ?? "", centerW);
    const rightCol = padCol(right[i] ?? "", rightW);
    lines.push(wrap(`${left} ${mid} ${rightCol}`));
  }

  lines.push(border(`├${"─".repeat(inner)}┤`));
  const footer = deckFooter(state);
  lines.push(wrap(theme.fg("dim", truncateToWidth(footer, inner, "…", true))));
  lines.push(border(`╰${"─".repeat(inner)}╯`));
  return lines;
}

function navLines(
  snapshot: DeckSessionSnapshot,
  state: DeckNavState,
  theme: Theme,
  width: number,
  focused: boolean,
): string[] {
  // Focus marker: ◉ = ↑↓ walks this column, ○ = ↑↓ moves the center list.
  // Without this the cursor appears to "go right" on ↓ while list-focused.
  const header = focused
    ? theme.fg(
        "accent",
        theme.bold(`◉ ${tr("deck.nav", "NAVIGATION")}`),
      )
    : theme.fg("muted", `○ ${tr("deck.nav", "NAVIGATION")}`);
  const lines: string[] = [header];
  for (const route of localizedRouteDefs()) {
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
  composer: ComposerDraft | null = null,
  tick = Date.now(),
  inner = width,
): string[] {
  const listFocused =
    !state.navMode && !state.searchOpen && !state.composerOpen;
  const title = listFocused
    ? theme.fg("accent", theme.bold(`◉ ${routeHeading(state.route)}`))
    : theme.fg("muted", `○ ${routeHeading(state.route)}`);
  const body: string[] = [title, ""];
  switch (state.route) {
    case "home":
      body.push(theme.fg("text", tr("deck.home.currentSession", "CURRENT SESSION")));
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
      body.push(
        truncateToWidth(
          `${appearanceDisplayName(snapshot.appearanceBase)} · ${snapshot.signalMotion} · ${snapshot.motionLevel}`,
          width,
          "…",
          true,
        ),
      );
      body.push("");
      // Right-now state: everything an operator glances at before deciding
      // what to do next, kept to one short line per concern.
      body.push(theme.fg("text", tr("deck.home.rightNow", "RIGHT NOW")));
      body.push(
        truncateToWidth(
          tr("deck.home.workload", "ideas {ideas} · queue {queue}", {
            ideas: snapshot.ideaCount,
            queue: snapshot.queueCount,
          }),
          width,
          "…",
          true,
        ),
      );
      body.push(
        truncateToWidth(
          `${tr("deck.home.bash", "bash")} ${snapshot.bashModeActive
            ? tr("common.on", "on")
            : tr("common.off", "off")} · ${tr("deck.home.policy", "policy")} ${snapshot.policyEnabled
            ? tr("common.on", "on")
            : tr("common.off", "off")} (${snapshot.policyRuleCount})`,
          width,
          "…",
          true,
        ),
      );
      body.push(
        truncateToWidth(
          `${tr("deck.home.shell", "shell")}: ${snapshot.shellName ?? tr("deck.home.shellIdle", "not started")}`,
          width,
          "…",
          true,
        ),
      );
      body.push("");
      body.push(
        theme.fg("text", tr("deck.home.nextIntent", "NEXT INTENT")),
      );
      body.push(
        truncateToWidth(
          snapshot.nextIntent ??
            tr("deck.home.noIntent", "No queued intent"),
          width,
          "…",
          true,
        ),
      );
      body.push("");
      body.push(theme.fg("text", tr("deck.home.quickKeys", "QUICK KEYS")));
      body.push(
        truncateToWidth(
          `${shortcuts.menu ?? "alt+p"} ${tr("deck.home.keyDeck", "deck")} · ${shortcuts.ideaCapture ?? "#"} ${tr("deck.home.keyIdea", "idea")}`,
          width,
          "…",
          true,
        ),
      );
      body.push(
        truncateToWidth(
          `! ${tr("deck.home.keyBash", "bash command")} · ${shortcuts.info ?? "alt+i"} ${tr("deck.home.keyInfo", "info")}`,
          width,
          "…",
          true,
        ),
      );
      break;
    case "signal":
      body.push("THREE LANES");
      body.push("Identity · Activity · Context");
      body.push(`Layout ${config.preset} · placement ${config.placement}`);
      body.push(
        `Base ${appearanceDisplayName(snapshot.appearanceBase)} · motion ${snapshot.signalMotion}`,
      );
      body.push(`Level ${snapshot.motionLevel} · activity ${snapshot.signalActivity}`);
      body.push("Use /signal preset · placement · doctor");
      break;
    case "skills":
      body.push(...skillsWorkbenchLines(snapshot, state, width, theme));
      break;
    case "ideas":
      body.push(...ideasLines(snapshot, state));
      break;
    case "guardrails":
      body.push(...guardrailLines(snapshot));
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
    case "appearance": {
      body.push(...appearanceLines(snapshot, state));
      // Live rail preview of the preset under the cursor — see what the
      // base looks like on the signal rail before applying it.
      const railPreview = appearanceRailPreview(snapshot, state, tick);
      if (railPreview) {
        body.push("");
        body.push(truncateToWidth(railPreview, inner, "…", true));
      }
      break;
    }
    case "ports":
      body.push(...portsLines(width, deckPortsOptions()));
      break;
    case "motion":
      body.push(...motionGalleryLines(snapshot, state, width, composer, tick));
      break;
    case "shortcuts":
      body.push(`Menu: ${shortcuts.menu ?? "alt+p"}`);
      body.push(`Queue: ${shortcuts.queueOpen ?? "ctrl+alt+q"}`);
      body.push(`Info: ${shortcuts.info ?? "alt+i"}`);
      body.push("g <key> jumps inside the Deck");
      break;
    case "diagnostics":
      body.push(
        tr(
          "deck.diag.envHint",
          "Run /signal doctor for the full environment report",
        ),
      );
      body.push(snapshot.policySummary);
      body.push(`Preset: ${config.preset} · base ${snapshot.appearanceBase}`);
      body.push(`Catalog: ${MOTION_CATALOG.length} motions`);
      body.push("");
      // Config half of the diagnosis: which settings.json wins, which keys
      // are shadowed or typos, which stored values are being discarded.
      body.push(...configDiagnosticLines(process.cwd(), width));
      break;
  }
  return body.map((line) => truncateToWidth(line, width, "…", true));
}

function rightRail(snapshot: DeckSessionSnapshot, theme: Theme, width: number): string[] {
  const fit = (text: string) => truncateToWidth(text, width, "…", true);
  const lines: string[] = [
    theme.fg("accent", tr("deck.rail.activity", "ACTIVITY FEED")),
    "",
  ];

  // Lead with what is happening *now* instead of an undifferentiated list.
  const [latest, ...recent] = snapshot.recentActivity;
  if (latest) {
    lines.push(theme.fg("text", fit(`◆ ${latest}`)));
    for (const item of recent.slice(0, 2)) lines.push(fit(`· ${item}`));
  } else {
    lines.push(theme.fg("muted", tr("deck.rail.noActivity", "No recent activity")));
  }
  lines.push("");
  lines.push(
    fit(
      tr("deck.rail.workload", "ideas {ideas} · queue {queue}", {
        ideas: snapshot.ideaCount,
        queue: snapshot.queueCount,
      }),
    ),
  );
  lines.push(
    fit(
      `${tr("deck.rail.bash", "bash")} ${snapshot.bashModeActive
        ? tr("common.on", "on")
        : tr("common.off", "off")}`,
    ),
  );

  // Alerts only when there is something to act on — an always-green rail is
  // noise, so the block is absent until it earns its space.
  const alerts: string[] = [];
  if (snapshot.skillsWarnings > 0) {
    alerts.push(
      tr("deck.rail.alertSkills", "{n} skills need attention", {
        n: snapshot.skillsWarnings,
      }),
    );
  }
  if (!snapshot.policyEnabled) {
    alerts.push(tr("deck.rail.alertPolicy", "guardrails are OFF"));
  }
  if (snapshot.contextPercent >= 90) {
    alerts.push(
      tr("deck.rail.alertContext", "context {pct}% full", {
        pct: snapshot.contextPercent,
      }),
    );
  }
  if (alerts.length > 0) {
    lines.push("");
    lines.push(theme.fg("warning", tr("deck.rail.alerts", "ATTENTION")));
    for (const alert of alerts) {
      lines.push(theme.fg("warning", fit(`! ${alert}`)));
    }
  }

  lines.push("");
  lines.push(
    theme.fg("accent", tr("deck.rail.skills", "SKILLS HEALTH")),
  );
  lines.push(
    tr(
      "deck.rail.healthy",
      "{n} healthy",
      { n: snapshot.skillsTotal - snapshot.skillsWarnings },
    ).replace(/^/, `✓ `),
  );
  if (snapshot.skillsWarnings > 0) {
    lines.push(
      theme.fg(
        "warning",
        tr("deck.rail.warnings", "{n} warnings", {
          n: snapshot.skillsWarnings,
        }).replace(/^/, `! `),
      ),
    );
  }
  lines.push("");
  lines.push(theme.fg("accent", tr("deck.rail.guardrails", "GUARDRAILS")));
  lines.push(
    fit(
      tr("deck.rail.policy", "Policy: {state} ({n})", {
        state: tr(
          snapshot.policyEnabled ? "common.on" : "common.off",
          snapshot.policyEnabled ? "ON" : "OFF",
        ),
        n: snapshot.policyRuleCount,
      }),
    ),
  );
  return lines;
}

function padCol(text: string, width: number): string {
  const plain = stripAnsi(text);
  if (plain.length >= width) return truncateToWidth(text, width, "…", true);
  return text + " ".repeat(width - plain.length);
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function formatK(value: number): string {
  if (value >= 1000) return `${Math.round(value / 1000)}k`;
  return String(value);
}

export function filterDeckRoutes(query: string): DeckRoute[] {
  const q = query.trim().toLowerCase();
  const defs = localizedRouteDefs();
  if (!q) return defs.map((route) => route.id);
  return defs.filter((route) => {
    // Match the localised copy first, then the English labels and the raw id
    // so "skills" still jumps even in Dutch.
    const hay = `${route.label} ${route.id} ${route.description}`.toLowerCase();
    const english =
      BUILTIN_DECK_ROUTE_DEFS.find((entry) => entry.id === route.id) ?? route;
    const raw = `${english.label} ${english.description}`.toLowerCase();
    return hay.includes(q) || raw.includes(q);
  }).map((route) => route.id);
}

export function layoutPresetNames(): string[] {
  return Object.keys(PRESETS);
}
