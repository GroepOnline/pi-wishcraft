/**
 * Center-pane bodies for Craft, Motion Gallery, and Composer.
 * Pure: given snapshot + nav + optional composer draft, return lines.
 */

import {
  COMPOSER_FIELDS,
  composerPreview,
  type ComposerDraft,
} from "../../../motion/composer.ts";
import { filterMotions, previewStrip } from "../../../motion/gallery.ts";
import { getMotion } from "../../../motion/catalog.ts";
import { STRUCTURAL_PRESET_NAMES } from "../../../config/types.ts";
import { config } from "../../core/state.ts";
import type { DeckNavState, DeckSessionSnapshot } from "./types.ts";

export function appearanceLines(
  snapshot: DeckSessionSnapshot,
  state: DeckNavState,
  width: number,
): string[] {
  const lines = [
    `Active base: ${snapshot.appearanceBase}`,
    `Layout preset: ${config.preset}`,
    `Motion level: ${snapshot.motionLevel}`,
    "Enter writes powerline.appearance.base and repaints Signal.",
  ];
  const cursor = state.selectedAppearance;
  for (let i = 0; i < STRUCTURAL_PRESET_NAMES.length; i++) {
    const name = STRUCTURAL_PRESET_NAMES[i]!;
    const marker = i === cursor ? "→" : " ";
    const star = name === snapshot.appearanceBase ? "*" : " ";
    lines.push(`${marker}${star} ${name}`);
  }
  return lines;
}

export function motionGalleryLines(
  snapshot: DeckSessionSnapshot,
  state: DeckNavState,
  width: number,
  composer: ComposerDraft | null,
): string[] {
  if (state.composerOpen && composer) {
    return composerLines(composer, state, width);
  }
  const query = state.route === "motion" ? state.searchQuery : "";
  const motions = filterMotions(query);
  const cursor = Math.min(state.selectedMotion, Math.max(0, motions.length - 1));
  const selected = motions[cursor];
  const tick = Math.floor(Date.now() / (selected ? (selected.generator?.intervalMs ?? 100) : 100));
  const lines = [
    `${motions.length} motions · assign ${state.assignEvent} · live ${snapshot.signalMotion}`,
    selected
      ? previewStrip(selected, tick, Math.min(28, width - 2))
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
): string[] {
  const tick = Math.floor(Date.now() / draft.intervalMs);
  const field = COMPOSER_FIELDS[state.composerField] ?? "intervalMs";
  const lines = [
    `COMPOSER · ${draft.name}`,
    composerPreview(draft, tick, Math.min(28, width - 2)),
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
): string[] {
  const query = state.route === "skills" ? state.searchQuery.trim().toLowerCase() : "";
  const rows = snapshot.skills.filter((skill) => {
    if (!query) return true;
    return `${skill.name} ${skill.category} ${skill.description}`.toLowerCase().includes(query);
  });
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

export function ideasLines(snapshot: DeckSessionSnapshot, state: DeckNavState): string[] {
  const lines = [
    `${snapshot.ideaCount} ideas · ${snapshot.queueCount} queued`,
    "Capture with # or /ideas",
  ];
  if (snapshot.ideas.length === 0) {
    lines.push("No captured ideas");
    return lines;
  }
  const cursor = Math.min(state.selectedIdea, snapshot.ideas.length - 1);
  snapshot.ideas.forEach((idea, i) => {
    const marker = i === cursor ? "→" : " ";
    lines.push(`${marker}[${idea.reviewStatus}] ${idea.text}`);
  });
  return lines;
}

export function guardrailLines(snapshot: DeckSessionSnapshot): string[] {
  const lines = [
    `Policy: ${snapshot.policyEnabled ? "ENABLED" : "OFF"} (${snapshot.policyRuleCount} rules)`,
    snapshot.policySummary,
  ];
  if (snapshot.guardrailRules.length === 0) {
    lines.push("No declarative rules in wishcraft.policy");
    return lines;
  }
  for (const rule of snapshot.guardrailRules) {
    lines.push(`${rule.action} ${rule.tool} · ${rule.reason}`);
  }
  return lines;
}

export function selectedGalleryMotion(state: DeckNavState) {
  const motions = filterMotions(state.route === "motion" ? state.searchQuery : "");
  return motions[Math.min(state.selectedMotion, Math.max(0, motions.length - 1))] ?? getMotion("ember-relay");
}

export function filteredSkillCount(snapshot: DeckSessionSnapshot, state: DeckNavState): number {
  const query = state.searchQuery.trim().toLowerCase();
  if (state.route !== "skills" || !query) return snapshot.skills.length;
  return snapshot.skills.filter((skill) =>
    `${skill.name} ${skill.category} ${skill.description}`.toLowerCase().includes(query),
  ).length;
}

