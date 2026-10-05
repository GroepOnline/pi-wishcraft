/**
 * Deck actions recovered with the operator layer: appearance-search apply
 * and the multi-step skill wizard.
 */

import { matchesKey } from "@earendil-works/pi-tui";
import {
  appearanceDisplayName,
  isStructuralPresetName,
} from "../../../config/structural-presets.ts";
import { isMotionLevel } from "../../../motion/accessibility.ts";
import type { RuntimeState } from "../../core/types.ts";
import {
  applyAppearanceBase,
  applyMotionAssignment,
  applyMotionLevel,
} from "../../settings/appearance-write.ts";
import { handleWizardKey, writeWizardSkill } from "../../skills/workbench.ts";
import type { AppearanceSearchHit } from "./appearance-search.ts";
import type { DeckNavState } from "./types.ts";

export function applyDeckAppearanceHit(
  rt: RuntimeState,
  cwd: string,
  hit: AppearanceSearchHit | undefined,
  notify: (ok: boolean, okText: string, failText: string) => void,
  warn: (message: string) => void,
): void {
  if (!hit) return;
  if (hit.kind === "preset" && isStructuralPresetName(hit.value)) {
    const ok = applyAppearanceBase(rt, cwd, hit.value);
    const label = appearanceDisplayName(hit.value);
    notify(ok, `Appearance: ${label}`, `Appearance: ${label} (not persisted)`);
    return;
  }
  if (hit.kind === "motion") {
    const ok = applyMotionAssignment(rt, cwd, "streaming", hit.value);
    notify(ok, `Motion streaming: ${hit.value}`, `Motion ${hit.value} (not persisted)`);
    return;
  }
  if (hit.kind === "level" && isMotionLevel(hit.value)) {
    const ok = applyMotionLevel(rt, cwd, hit.value);
    notify(ok, `Motion level: ${hit.value}`, `Motion level ${hit.value} (not persisted)`);
    return;
  }
  warn(`${hit.label} is not a persisted control`);
}

export function reduceSkillWizard(
  state: DeckNavState,
  data: string,
  host: {
    refresh: () => void;
    info: (message: string) => void;
    warn: (message: string) => void;
  },
): DeckNavState {
  const wizard = state.skillWizard;
  if (!wizard) return state;
  const key = matchesKey(data, "enter")
    ? "enter"
    : matchesKey(data, "backspace")
      ? "backspace"
      : data;
  const result = handleWizardKey(wizard, key);
  if (result.type === "close") return { ...state, skillWizard: null };
  if (result.type === "save") {
    try {
      const { filePath } = writeWizardSkill(result.wizard);
      host.refresh();
      host.info(`Created ${result.wizard.name}. ${filePath}`);
    } catch (error) {
      host.warn(error instanceof Error ? error.message : String(error));
    }
    return { ...state, skillWizard: null };
  }
  return { ...state, skillWizard: result.wizard };
}
