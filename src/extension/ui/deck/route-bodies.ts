/**
 * Center-pane bodies for Craft, Motion Gallery, and Composer.
 * Pure: given snapshot + nav + optional composer draft, return lines.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  COMPOSER_FIELDS,
  composerPreview,
  type ComposerDraft,
} from "../../../motion/composer.ts";
import { createSignalRuntime } from "../../../signal/controller.ts";
import { renderActivity } from "../../../render/motion-rail.ts";
import { filterMotions, GALLERY_CATEGORIES, previewStrip } from "../../../motion/gallery.ts";
import { getMotion } from "../../../motion/catalog.ts";
import { STRUCTURAL_PRESET_NAMES } from "../../../config/types.ts";
import { searchAppearanceConfig } from "./appearance-search.ts";
import { renderSkillWizard } from "../../skills/workbench.ts";
import {
  appearanceDisplayName,
  getStructuralPreset,
} from "../../../config/structural-presets.ts";
import { config } from "../../core/state.ts";
import { tr } from "../../../i18n/index.ts";
import {
  formatPortsSummary,
  peekPorts,
  portsTableLines,
  summarizePorts,
} from "../../../segments/ports.ts";
import type { DeckNavState, DeckSessionSnapshot, DeckSkillRow } from "./types.ts";

/** Localised review-status badge for an idea row. */
function ideaStatusBadge(status: string): string {
  if (status === "done") return tr("deck.ideas.statusDone", "[done]");
  if (status === "in-progress") return tr("deck.ideas.statusDoing", "[in-progress]");
  return tr("deck.ideas.statusIdea", "[idea]");
}

export function filterSkillRows(skills: readonly DeckSkillRow[], query: string): DeckSkillRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...skills];
  return skills.filter((skill) =>
    `${skill.name} ${skill.category} ${skill.description}`.toLowerCase().includes(q),
  );
}

/**
 * Live signal preview for the appearance route: renders the candidate
 * preset's own signal spec with a travelling head at `tick`, so browsing
 * the preset list shows each base's rail look before applying it.
 * Pure in (snapshot, state, tick); no dispatch, no persistence.
 */
export function appearanceRailPreview(
  snapshot: DeckSessionSnapshot,
  state: DeckNavState,
  tick = Date.now(),
): string | null {
  const selected = STRUCTURAL_PRESET_NAMES[state.selectedAppearance];
  if (!selected) return null;
  const frameTick = Math.floor(tick / 90);
  const spec = getStructuralPreset(selected).signal;
  const runtime = createSignalRuntime(0);
  runtime.event = "streaming";
  runtime.motionId = spec.animation;
  runtime.activity = appearanceDisplayName(selected);
  runtime.active = true;
  runtime.tick = frameTick;
  return renderActivity(runtime, spec, false, 80, 0);
}

export function appearanceLines(
  snapshot: DeckSessionSnapshot,
  state: DeckNavState,
): string[] {
  const query = state.route === "appearance" ? state.searchQuery.trim() : "";
  if (query) {
    const hits = searchAppearanceConfig(query);
    if (hits.length === 0) return [`No appearance hits for "${query}"`];
    const cursor = Math.min(state.selectedAppearance, hits.length - 1);
    const start = Math.max(0, cursor - 4);
    const lines = [`Search ${hits.length} · enter applies preset, motion, or level`];
    for (let i = start; i < Math.min(hits.length, start + 10); i++) {
      const hit = hits[i]!;
      const marker = i === cursor ? "→" : " ";
      lines.push(`${marker}${hit.group}: ${hit.label}`);
    }
    return lines;
  }
  const selected = STRUCTURAL_PRESET_NAMES[state.selectedAppearance];
  const selectedDef = selected ? getStructuralPreset(selected) : null;
  const lines = [
    `Active: ${appearanceDisplayName(snapshot.appearanceBase)}`,
    `Cursor: ${selected ? appearanceDisplayName(selected) : "—"} · enter applies`,
    `Layout ${config.preset} · motion ${snapshot.motionLevel}`,
    selectedDef ? selectedDef.description : "Enter applies the structural base to Signal.",
  ];
  const cursor = state.selectedAppearance;
  for (let i = 0; i < STRUCTURAL_PRESET_NAMES.length; i++) {
    const name = STRUCTURAL_PRESET_NAMES[i]!;
    const preset = getStructuralPreset(name);
    const marker = i === cursor ? "→" : " ";
    const star = name === snapshot.appearanceBase ? "*" : " ";
    lines.push(`${marker}${star} ${preset.displayName.padEnd(14)} ${name}`);
  }
  return lines;
}

export function motionGalleryLines(
  snapshot: DeckSessionSnapshot,
  state: DeckNavState,
  width: number,
  composer: ComposerDraft | null,
  tick = Date.now(),
): string[] {
  if (state.composerOpen && composer) {
    return composerLines(composer, state, width, tick);
  }
  const query = state.route === "motion" ? state.searchQuery : "";
  const motions = filterMotions(query);
  const cursor = Math.min(state.selectedMotion, Math.max(0, motions.length - 1));
  const selected = motions[cursor];
  const counts = GALLERY_CATEGORIES.map((category) => {
    const n = motions.filter((entry) => entry.category === category).length;
    return n > 0 ? `${category} ${n}` : "";
  }).filter(Boolean);
  const frameTick = Math.floor(tick / (selected ? (selected.generator?.intervalMs ?? 100) : 100));
  const lines = [
    `${motions.length} motions · ${counts.join(" · ")}`,
    `assign ${state.assignEvent} · live ${snapshot.signalMotion}`,
    selected
      ? previewStrip(selected, frameTick, Math.min(28, width - 2))
      : "No motions match",
    "↑↓ select · t event · e composer · enter apply",
  ];
  const window = 8;
  const start = Math.max(0, cursor - 3);
  const end = Math.min(motions.length, start + window);
  for (let i = start; i < end; i++) {
    const def = motions[i]!;
    const marker = i === cursor ? "→" : " ";
    lines.push(`${marker} ${def.category.padEnd(10)} ${def.name}`);
  }
  if (selected) {
    lines.push("");
    lines.push(selected.description);
  }
  return lines;
}

function composerLines(
  draft: ComposerDraft,
  state: DeckNavState,
  width: number,
  tick = Date.now(),
): string[] {
  const frameTick = Math.floor(tick / draft.intervalMs);
  const field = COMPOSER_FIELDS[state.composerField] ?? "intervalMs";
  const lines = [
    `COMPOSER · ${draft.name}`,
    composerPreview(draft, frameTick, Math.min(28, width - 2)),
    `Assign to ${draft.assignEvent}`,
    "←→ nudge · ↑↓ field · enter apply · esc back",
  ];
  for (const name of COMPOSER_FIELDS) {
    const marker = name === field ? "→" : " ";
    const value =
      name === "geometry"
        ? draft.geometry
        : name === "intervalMs"
          ? `${draft.intervalMs}ms`
          : name === "trail"
            ? String(draft.trail)
            : name === "direction"
              ? draft.direction
              : name === "ease"
                ? draft.ease
                : draft.assignEvent;
    lines.push(`${marker} ${name}: ${value}`);
  }
  return lines;
}

export function skillsWorkbenchLines(
  snapshot: DeckSessionSnapshot,
  state: DeckNavState,
  width: number,
  theme?: Theme,
): string[] {
  if (state.skillWizard) {
    const paint = theme ?? { fg: (_color: string, text: string) => text };
    return renderSkillWizard(paint as Theme, width, state.skillWizard);
  }
  const query = state.route === "skills" ? state.searchQuery : "";
  const rows = filterSkillRows(snapshot.skills, query);
  const cursor = Math.min(state.selectedSkill, Math.max(0, rows.length - 1));
  const selected = rows[cursor];
  if (state.skillCreate) {
    return [
      "NEW SKILL",
      `Name: ${state.skillCreateName}_`,
      "Writes ~/.pi/agent/skills/<name>/SKILL.md from the standard template.",
      "type a name · enter create · esc cancel",
    ];
  }
  const lines = [
    `WORKBENCH · ${snapshot.skillsTotal} skills · ${snapshot.skillsWarnings} warnings`,
    "↑↓ select · enter insert · n new skill",
  ];
  if (rows.length === 0) {
    lines.push(query ? "No skills match this search" : "No skills loaded");
    return lines;
  }
  const start = Math.max(0, cursor - 4);
  const end = Math.min(rows.length, start + 8);
  for (let i = start; i < end; i++) {
    const skill = rows[i]!;
    const marker = i === cursor ? "→" : " ";
    const mark = skill.status === "ok" ? "✓" : skill.status === "fail" ? "✗" : "!";
    const spark = "#".repeat(Math.min(6, skill.usage)) + "·".repeat(Math.max(0, 6 - Math.min(6, skill.usage)));
    lines.push(`${marker}${mark} ${skill.name} · ${skill.category} ${spark}`);
  }
  if (selected) {
    lines.push("");
    lines.push(`${selected.name} [${selected.status}]`);
    lines.push(selected.description || "No description");
  }
  return lines;
}

const IDEA_WINDOW = 8;
const GUARDRAIL_MAX = 10;

/**
 * The ports route's probe options, derived from config. Shared by the renderer
 * (to read the cache) and the component (to kick off the probe) so both always
 * ask for the same thing.
 */
export function deckPortsOptions(): { includeUdp: boolean; host?: string } {
  return {
    includeUdp: config.segmentOptions?.openPorts?.includeUdp === true,
    host: config.segmentOptions?.openPorts?.host,
  };
}

/** Ideas for the current route, filtered by the Deck's `/` search. */
export function filteredIdeas(
  snapshot: DeckSessionSnapshot,
  state: DeckNavState,
): DeckSessionSnapshot["ideas"] {
  const query = state.route === "ideas" ? state.searchQuery.trim().toLowerCase() : "";
  if (!query) return snapshot.ideas;
  return snapshot.ideas.filter(
    (idea) =>
      idea.text.toLowerCase().includes(query) ||
      idea.reviewStatus.toLowerCase().includes(query),
  );
}

/**
 * Ideas route: filterable by the Deck's `/` search, windowed around the
 * cursor (the window *is* the scroll — ↑↓ moves it), and bounded so a long
 * queue cannot grow the frame past the screen.
 */
export function ideasLines(snapshot: DeckSessionSnapshot, state: DeckNavState): string[] {
  const query = state.route === "ideas" ? state.searchQuery.trim().toLowerCase() : "";
  const ideas = filteredIdeas(snapshot, state);

  const lines = [
    tr("deck.ideas.header", "{ideas} ideas · {queue} queued", {
      ideas: snapshot.ideaCount,
      queue: snapshot.queueCount,
    }),
    query
      ? tr("deck.ideas.filtered", "{n} match '{q}'", { n: ideas.length, q: state.searchQuery })
      : tr("deck.ideas.capture", "Capture with # or /ideas"),
    "",
  ];

  if (ideas.length === 0) {
    lines.push(
      query
        ? tr("deck.ideas.noMatch", "No ideas match this search")
        : tr("deck.ideas.none", "No captured ideas"),
    );
    return lines;
  }

  const cursor = Math.min(state.selectedIdea, ideas.length - 1);
  const start = Math.max(0, Math.min(ideas.length - IDEA_WINDOW, cursor - Math.floor(IDEA_WINDOW / 2)));
  const end = Math.min(ideas.length, start + IDEA_WINDOW);
  if (start > 0) {
    lines.push(tr("deck.ideas.above", "… {n} above", { n: start }));
  }
  for (let i = start; i < end; i++) {
    const idea = ideas[i]!;
    const marker = i === cursor ? "→" : " ";
    lines.push(`${marker}${ideaStatusBadge(idea.reviewStatus)} ${idea.text}`);
  }
  if (end < ideas.length) {
    lines.push(tr("deck.ideas.below", "… {n} below", { n: ideas.length - end }));
  }
  return lines;
}

export function guardrailLines(snapshot: DeckSessionSnapshot): string[] {
  const lines = [
    tr("deck.guard.policy", "Policy: {state} ({n} rules)", {
      state: tr(
        snapshot.policyEnabled ? "common.on" : "common.off",
        snapshot.policyEnabled ? "ENABLED" : "OFF",
      ),
      n: snapshot.policyRuleCount,
    }),
    snapshot.policySummary,
    "",
  ];
  if (snapshot.guardrailRules.length === 0) {
    lines.push(tr("deck.guard.none", "No declarative rules in wishcraft.policy"));
    return lines;
  }
  const shown = snapshot.guardrailRules.slice(0, GUARDRAIL_MAX);
  for (const rule of shown) {
    lines.push(`${rule.action} ${rule.tool} · ${rule.reason}`);
  }
  if (snapshot.guardrailRules.length > shown.length) {
    lines.push(
      tr("deck.guard.more", "… {n} more", {
        n: snapshot.guardrailRules.length - shown.length,
      }),
    );
  }
  return lines;
}

/**
 * Ports route body. Reads the shared probe cache so the Deck never spawns
 * `ss` during a render; the component kicks off the async probe when the
 * route is entered (and on `r`).
 */
export function portsLines(
  width: number,
  options: { includeUdp: boolean; host?: string },
): string[] {
  const probe = peekPorts(options);
  if (!probe) {
    return [
      tr("deck.ports.probing", "Probing listening sockets…"),
      "",
      tr("deck.ports.hint", "press r to re-probe"),
    ];
  }
  if (probe.rows.length === 0) {
    return [
      probe.error ?? tr("deck.ports.none", "No listening sockets"),
      "",
      tr("deck.ports.hint", "press r to re-probe"),
    ];
  }

  const summary = summarizePorts(probe.rows);
  const lines = [
    formatPortsSummary(summary, probe.host, options.includeUdp),
    "",
    ...portsTableLines(probe.rows, width, 12),
    "",
    tr("deck.ports.exposed", "{n} reachable from other machines", {
      n: summary.exposed,
    }),
  ];
  return lines;
}

export function selectedGalleryMotion(state: DeckNavState) {
  const motions = filterMotions(state.route === "motion" ? state.searchQuery : "");
  return motions[Math.min(state.selectedMotion, Math.max(0, motions.length - 1))] ?? getMotion("ember-relay");
}

export function filteredSkillCount(snapshot: DeckSessionSnapshot, state: DeckNavState): number {
  if (state.route !== "skills") return snapshot.skills.length;
  return filterSkillRows(snapshot.skills, state.searchQuery).length;
}

