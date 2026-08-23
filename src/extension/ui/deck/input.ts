/**
 * Pure Deck input router. Tests drive this without ctx.ui.
 */

import { matchesKey } from "@earendil-works/pi-tui";
import { applyOverlayQueryKey, isOverlayPrintable } from "../overlay-chrome.ts";
import { DECK_ROUTE_DEFS, deckRouteByJump, deckRouteIndex, filterDeckRoutes } from "./routes.ts";
import {
  applyAppearanceHit,
  applyAppearanceSelection,
  nextAppearancePane,
  paneOptions,
  searchAppearanceConfig,
} from "./appearance.ts";
import {
  advanceWizard,
  applyWizardInput,
  createSkillWizard,
  cycleWizardTemplate,
  retreatWizard,
  wizardIsComplete,
  type SkillWizardState,
} from "../../skills/workbench.ts";
import { toggleFavorite } from "../../../motion/gallery.ts";
import type { AppearanceMixConfig } from "../../../config/types.ts";
import type { MotionLevel, MotionPolicy } from "../../../motion/types.ts";
import { isMotionLevel } from "../../../motion/accessibility.ts";
import {
  defaultAppearanceState,
  defaultSkillsState,
  normalizeDeckNavState,
  type DeckNavState,
  type DeckRoute,
} from "./types.ts";

export type DeckAction =
  | { type: "none" }
  | { type: "close" }
  | { type: "appearance"; mix: AppearanceMixConfig }
  | { type: "policy"; level: MotionLevel }
  | { type: "wizard-complete"; wizard: SkillWizardState }
  | { type: "insert-skill"; index: number };

export function applyDeckInput(
  state: DeckNavState,
  data: string,
  mix: AppearanceMixConfig = {},
  skillCount = Number.POSITIVE_INFINITY,
): { state: DeckNavState; action: DeckAction } {
  const nav = normalizeDeckNavState(state);
  const appearance = { ...nav.appearance };
  const skills = { ...nav.skills };

  if (matchesKey(data, "escape") || data === "escape") {
    if (skills.wizardOpen) {
      return { state: { ...nav, skills: { ...skills, wizardOpen: false } }, action: { type: "none" } };
    }
    if (appearance.composerOpen) {
      return {
        state: { ...nav, appearance: { ...appearance, composerOpen: false } },
        action: { type: "none" },
      };
    }
    if (nav.searchOpen) {
      return {
        state: { ...nav, searchOpen: false, searchQuery: "" },
        action: { type: "none" },
      };
    }
    return { state: nav, action: { type: "close" } };
  }

  if (skills.wizardOpen) {
    if (data === "up") {
      return {
        state: { ...nav, skills: { ...skills, wizard: cycleOpenWizard(skills, -1) } },
        action: { type: "none" },
      };
    }
    if (data === "down") {
      return {
        state: { ...nav, skills: { ...skills, wizard: cycleOpenWizard(skills, 1) } },
        action: { type: "none" },
      };
    }
    const wizard = getWizard(skills);
    if ((matchesKey(data, "enter") || data === "enter") && wizardIsComplete(wizard)) {
      return {
        state: { ...nav, skills: { ...skills, wizardOpen: false, wizard } },
        action: { type: "wizard-complete", wizard },
      };
    }
    if (data === "left") {
      return {
        state: { ...nav, skills: { ...skills, wizard: retreatWizard(wizard) } },
        action: { type: "none" },
      };
    }
    return {
      state: { ...nav, skills: { ...skills, wizard: applyWizardInput(wizard, data) } },
      action: { type: "none" },
    };
  }

  if (data === "/") {
    return { state: { ...nav, searchOpen: true }, action: { type: "none" } };
  }

  if (nav.searchOpen) {
    const next = applyOverlayQueryKey(nav.searchQuery, data);
    if (next !== null) {
      const updated = { ...nav, searchQuery: next };
      const routes = filterDeckRoutes(next);
      const settings = searchAppearanceConfig(next);
      if (routes.length === 1 && settings.length === 0) {
        return {
          state: jumpTo(updated, routes[0]!),
          action: { type: "none" },
        };
      }
      return { state: updated, action: { type: "none" } };
    }
    if (matchesKey(data, "enter") || data === "enter") {
      const query = nav.searchQuery.trim().toLowerCase();
      const routes = filterDeckRoutes(nav.searchQuery);
      const exactRoute = routes.find((route) => route === query);
      if (exactRoute) {
        return { state: jumpTo({ ...nav, searchOpen: false, searchQuery: "" }, exactRoute), action: { type: "none" } };
      }
      const settings = searchAppearanceConfig(nav.searchQuery);
      if (settings[0] && routes.length !== 1) {
        const hit = settings[0];
        if (hit.kind === "level" && isMotionLevel(hit.value)) {
          return {
            state: { ...nav, searchOpen: false, searchQuery: "" },
            action: { type: "policy", level: hit.value },
          };
        }
        return {
          state: { ...nav, searchOpen: false, searchQuery: "" },
          action: { type: "appearance", mix: applyAppearanceHit(mix, hit) },
        };
      }
      if (routes[0]) {
        return { state: jumpTo({ ...nav, searchOpen: false, searchQuery: "" }, routes[0]), action: { type: "none" } };
      }
    }
    return { state: nav, action: { type: "none" } };
  }

  if (data === "g") {
    return { state: { ...nav, pendingJump: "g" }, action: { type: "none" } };
  }

  if (nav.pendingJump === "g" && data.length === 1 && isOverlayPrintable(data)) {
    const route = deckRouteByJump(data);
    return {
      state: {
        ...nav,
        pendingJump: null,
        route: route ?? nav.route,
        selectedNav: route ? deckRouteIndex(route) : nav.selectedNav,
      },
      action: { type: "none" },
    };
  }

  let nextState: Required<DeckNavState> = { ...nav, pendingJump: null };

  if (matchesKey(data, "up") || data === "up") {
    if (nextState.route === "appearance" || nextState.route === "motion") {
      appearance.selected = Math.max(0, appearance.selected - 1);
      return { state: { ...nextState, appearance }, action: { type: "none" } };
    }
    if (nextState.route === "skills") {
      skills.selected = Math.max(0, skills.selected - 1);
      return { state: { ...nextState, skills }, action: { type: "none" } };
    }
    const selected = Math.max(0, nextState.selectedNav - 1);
    return {
      state: { ...nextState, selectedNav: selected, route: DECK_ROUTE_DEFS[selected]?.id ?? nextState.route },
      action: { type: "none" },
    };
  }

  if (matchesKey(data, "down") || data === "down") {
    if (nextState.route === "appearance" || nextState.route === "motion") {
      const max = Math.max(0, paneOptions(appearance.pane).length - 1);
      appearance.selected = Math.min(max, appearance.selected + 1);
      return { state: { ...nextState, appearance }, action: { type: "none" } };
    }
    if (nextState.route === "skills") {
      const max = Number.isFinite(skillCount) ? Math.max(0, skillCount - 1) : skills.selected + 1;
      skills.selected = Math.min(max, skills.selected + 1);
      return { state: { ...nextState, skills }, action: { type: "none" } };
    }
    const selected = Math.min(DECK_ROUTE_DEFS.length - 1, nextState.selectedNav + 1);
    return {
      state: { ...nextState, selectedNav: selected, route: DECK_ROUTE_DEFS[selected]?.id ?? nextState.route },
      action: { type: "none" },
    };
  }

  if (data === "?") {
    return { state: jumpTo(nextState, "shortcuts"), action: { type: "none" } };
  }

  if (nextState.route === "skills" && (data === "n" || data === "N")) {
    return {
      state: { ...nextState, skills: { ...skills, wizardOpen: true, wizard: createSkillWizard() } },
      action: { type: "none" },
    };
  }

  if (
    nextState.route === "skills" &&
    (matchesKey(data, "enter") || data === "enter") &&
    skillCount > 0
  ) {
    return {
      state: nextState,
      action: { type: "insert-skill", index: skills.selected },
    };
  }

  if (nextState.route === "appearance" || nextState.route === "motion") {
    if (data === "tab" || matchesKey(data, "tab")) {
      appearance.pane = nextAppearancePane(appearance.pane);
      appearance.selected = 0;
      return { state: { ...nextState, appearance }, action: { type: "none" } };
    }
    if (data === "e") {
      appearance.composerOpen = !appearance.composerOpen;
      return { state: { ...nextState, appearance }, action: { type: "none" } };
    }
    if (data === " ") {
      appearance.playing = !appearance.playing;
      appearance.previewTick += 1;
      return { state: { ...nextState, appearance }, action: { type: "none" } };
    }
    if (data === "f") {
      const options = paneOptions("motion");
      const id = options[appearance.selected];
      if (id) appearance.favorites = toggleFavorite(appearance.favorites, id);
      return { state: { ...nextState, appearance }, action: { type: "none" } };
    }
    if (matchesKey(data, "enter") || data === "enter") {
      const value = paneOptions(appearance.pane)[appearance.selected];
      if (!value) return { state: nextState, action: { type: "none" } };
      if (appearance.pane === "accessibility" && isMotionLevel(value)) {
        return { state: nextState, action: { type: "policy", level: value } };
      }
      return {
        state: nextState,
        action: { type: "appearance", mix: applyAppearanceSelection(mix, appearance.pane, value) },
      };
    }
  }

  return { state: nextState, action: { type: "none" } };
}

function jumpTo(state: DeckNavState, route: DeckRoute): Required<DeckNavState> {
  const nav = normalizeDeckNavState(state);
  return {
    ...nav,
    route,
    selectedNav: deckRouteIndex(route),
    searchOpen: false,
    searchQuery: "",
    pendingJump: null,
    appearance: nav.appearance ?? defaultAppearanceState(),
    skills: nav.skills ?? defaultSkillsState(),
  };
}

interface SkillsWithWizard {
  wizardOpen: boolean;
  selected: number;
  previewScroll: number;
  wizard?: SkillWizardState;
}

function getWizard(skills: SkillsWithWizard): SkillWizardState {
  return skills.wizard ?? createSkillWizard();
}

function cycleOpenWizard(skills: SkillsWithWizard, direction: number): SkillWizardState {
  return cycleWizardTemplate(getWizard(skills), direction);
}

export function tickAppearancePreview(state: DeckNavState): DeckNavState {
  const nav = normalizeDeckNavState(state);
  if (!nav.appearance.playing) return nav;
  return {
    ...nav,
    appearance: { ...nav.appearance, previewTick: nav.appearance.previewTick + 1 },
  };
}
