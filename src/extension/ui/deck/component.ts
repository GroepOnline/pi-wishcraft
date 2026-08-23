import { matchesKey } from "@earendil-works/pi-tui";
import { STRUCTURAL_PRESET_NAMES } from "../../../config/types.ts";
import {
  COMPOSER_FIELDS,
  cycleAssignEvent,
  draftFromMotion,
  nudgeComposer,
  type ComposerDraft,
  type ComposerField,
} from "../../../motion/composer.ts";
import { filterMotions } from "../../../motion/gallery.ts";
import {
  applyAppearanceBase,
  applyMotionAssignment,
} from "../../settings/appearance-write.ts";
import {
  insertSkillBody,
  loadSkillCatalog,
  readSkillBody,
} from "../../skills/skill-registry.ts";
import { writeSkillFromTemplate } from "../../skills/skill-templates.ts";
import {
  applyOverlayQueryKey,
  isOverlayPrintable,
} from "../overlay-chrome.ts";
import type { RuntimeState } from "../../core/types.ts";
import { selectedGalleryMotion } from "./route-bodies.ts";
import { buildDeckSessionSnapshot } from "./session-snapshot.ts";
import { deckRouteByJump, deckRouteIndex } from "./routes.ts";
import { filterDeckRoutes, renderDeckFrame } from "./render.ts";
import { DECK_ROUTE_DEFS } from "./routes.ts";
import type { DeckNavState, DeckRoute } from "./types.ts";

function appearanceIndex(base: string): number {
  const idx = (STRUCTURAL_PRESET_NAMES as readonly string[]).indexOf(base);
  return idx >= 0 ? idx : 0;
}

export function createDeckNavState(
  route: DeckRoute,
  selectedAppearance = 0,
): DeckNavState {
  return {
    route,
    selectedNav: deckRouteIndex(route),
    searchOpen: false,
    searchQuery: "",
    pendingJump: null,
    selectedAppearance,
    selectedMotion: 0,
    selectedSkill: 0,
    selectedIdea: 0,
    composerOpen: false,
    composerField: 0,
    assignEvent: "streaming",
    skillCreate: false,
    skillCreateName: "",
  };
}

export function createDeckComponent(
  rt: RuntimeState,
  ctx: any,
  initialRoute: DeckRoute,
  theme: import("@earendil-works/pi-coding-agent").Theme,
  done: () => void,
) {
  const refreshSnapshot = () => buildDeckSessionSnapshot(rt, ctx);
  let state = createDeckNavState(
    initialRoute,
    appearanceIndex(refreshSnapshot().appearanceBase),
  );
  let composer: ComposerDraft | null = null;

  const setRoute = (route: DeckRoute): void => {
    const jumpingToAppearance = route === "appearance" && state.route !== "appearance";
    state = {
      ...state,
      route,
      selectedNav: deckRouteIndex(route),
      composerOpen: false,
      searchOpen: false,
      searchQuery: "",
      selectedAppearance: jumpingToAppearance
        ? appearanceIndex(refreshSnapshot().appearanceBase)
        : state.selectedAppearance,
    };
    composer = null;
  };

  const notify = (ok: boolean, okText: string, failText: string) => {
    ctx.ui.notify(ok ? okText : failText, ok ? "info" : "warning");
  };

  return {
    focused: true,
    invalidate() {},
    render(width: number) {
      return renderDeckFrame(
        theme,
        width,
        refreshSnapshot(),
        state,
        rt.resolvedShortcuts,
        composer,
      );
    },
    handleInput(data: string) {
      if (matchesKey(data, "escape")) {
        if (state.composerOpen) {
          state = { ...state, composerOpen: false };
          composer = null;
          return;
        }
        if (state.skillCreate) {
          state = { ...state, skillCreate: false, skillCreateName: "" };
          return;
        }
        if (state.searchOpen) {
          state = { ...state, searchOpen: false, searchQuery: "" };
          return;
        }
        done();
        return;
      }

      if (data === "/" && !state.composerOpen) {
        state = { ...state, searchOpen: true };
        return;
      }

      if (state.searchOpen) {
        handleSearch(data);
        return;
      }

      if (data === "g" && !state.composerOpen) {
        state = { ...state, pendingJump: "g" };
        return;
      }

      if (state.pendingJump === "g" && data.length === 1 && isOverlayPrintable(data)) {
        const route = deckRouteByJump(data);
        state = { ...state, pendingJump: null };
        if (route) setRoute(route);
        return;
      }

      state = { ...state, pendingJump: null };

      if (state.composerOpen && composer) {
        handleComposer(data);
        return;
      }

      if (state.route === "appearance") {
        if (handleList(data, "selectedAppearance", STRUCTURAL_PRESET_NAMES.length)) return;
        if (matchesKey(data, "enter")) {
          const name = STRUCTURAL_PRESET_NAMES[state.selectedAppearance];
          if (name) {
            const ok = applyAppearanceBase(rt, ctx.cwd ?? process.cwd(), name);
            notify(ok, `Appearance: ${name}`, `Appearance: ${name} (not persisted)`);
          }
          return;
        }
      }

      if (state.route === "motion") {
        const count = filterMotions(state.searchQuery).length;
        if (handleList(data, "selectedMotion", count)) return;
        if (data === "t") {
          state = { ...state, assignEvent: cycleAssignEvent(state.assignEvent) };
          return;
        }
        if (data === "e") {
          const motion = selectedGalleryMotion(state);
          if (motion) {
            composer = draftFromMotion(motion, state.assignEvent);
            state = { ...state, composerOpen: true, composerField: 0 };
          }
          return;
        }
        if (matchesKey(data, "enter")) {
          const motion = selectedGalleryMotion(state);
          if (motion) {
            const ok = applyMotionAssignment(
              rt,
              ctx.cwd ?? process.cwd(),
              state.assignEvent,
              motion.id,
            );
            notify(
              ok,
              `Motion ${state.assignEvent}: ${motion.id}`,
              `Motion ${motion.id} (not persisted)`,
            );
          }
          return;
        }
      }

      if (state.route === "skills") {
        if (state.skillCreate) {
          if (matchesKey(data, "enter")) {
            const name = state.skillCreateName.trim();
            if (!name) return;
            try {
              const { filePath } = writeSkillFromTemplate(name, "standard");
              state = { ...state, skillCreate: false, skillCreateName: "" };
              ctx.ui.notify(`Created ${name}. ${filePath}`, "info");
            } catch (error) {
              ctx.ui.notify(
                error instanceof Error ? error.message : String(error),
                "warning",
              );
            }
            return;
          }
          if (matchesKey(data, "backspace")) {
            state = { ...state, skillCreateName: state.skillCreateName.slice(0, -1) };
            return;
          }
          if (isOverlayPrintable(data)) {
            state = { ...state, skillCreateName: state.skillCreateName + data };
            return;
          }
          return;
        }
        if (data === "n") {
          state = { ...state, skillCreate: true, skillCreateName: "" };
          return;
        }
        const snapshot = refreshSnapshot();
        const query = state.searchQuery.trim().toLowerCase();
        const rows = snapshot.skills.filter((skill) => {
          if (!query) return true;
          return `${skill.name} ${skill.category} ${skill.description}`
            .toLowerCase()
            .includes(query);
        });
        if (handleList(data, "selectedSkill", rows.length)) return;
        if (matchesKey(data, "enter")) {
          const selected = rows[state.selectedSkill];
          if (!selected) return;
          const cwd = ctx.cwd ?? process.cwd();
          const entry = loadSkillCatalog(cwd).find((skill) => skill.name === selected.name);
          if (!entry) {
            ctx.ui.notify(`Skill ${selected.name} not found`, "warning");
            return;
          }
          insertSkillBody(ctx, entry.name, readSkillBody(entry.filePath));
          ctx.ui.notify(`Inserted skill ${entry.name}`, "info");
          done();
          return;
        }
      }

      if (state.route === "ideas") {
        if (handleList(data, "selectedIdea", refreshSnapshot().ideas.length)) return;
      }

      if (matchesKey(data, "up")) {
        const next = Math.max(0, state.selectedNav - 1);
        setRoute(DECK_ROUTE_DEFS[next]?.id ?? state.route);
        return;
      }
      if (matchesKey(data, "down")) {
        const next = Math.min(DECK_ROUTE_DEFS.length - 1, state.selectedNav + 1);
        setRoute(DECK_ROUTE_DEFS[next]?.id ?? state.route);
        return;
      }

      if (data === "?") {
        setRoute("shortcuts");
      }
    },
    dispose() {},
  };

  function handleList(
    data: string,
    key: "selectedAppearance" | "selectedMotion" | "selectedSkill" | "selectedIdea",
    length: number,
  ): boolean {
    if (length <= 0) return false;
    if (matchesKey(data, "up")) {
      state = { ...state, [key]: Math.max(0, state[key] - 1) };
      return true;
    }
    if (matchesKey(data, "down")) {
      state = { ...state, [key]: Math.min(length - 1, state[key] + 1) };
      return true;
    }
    return false;
  }

  function handleSearch(data: string): void {
    const next = applyOverlayQueryKey(state.searchQuery, data);
    if (next !== null) {
      state = { ...state, searchQuery: next, selectedMotion: 0, selectedSkill: 0 };
      if (state.route !== "motion" && state.route !== "skills") {
        const matches = filterDeckRoutes(next);
        if (matches.length === 1) {
          state = { ...state, searchOpen: false, searchQuery: "" };
          setRoute(matches[0]!);
        }
      }
      return;
    }
    if (matchesKey(data, "enter")) {
      if (state.route === "motion" || state.route === "skills") {
        state = { ...state, searchOpen: false };
        return;
      }
      const matches = filterDeckRoutes(state.searchQuery);
      if (matches[0]) {
        state = { ...state, searchOpen: false, searchQuery: "" };
        setRoute(matches[0]);
      }
    }
  }

  function handleComposer(data: string): void {
    if (!composer) return;
    if (matchesKey(data, "up")) {
      state = { ...state, composerField: Math.max(0, state.composerField - 1) };
      return;
    }
    if (matchesKey(data, "down")) {
      state = {
        ...state,
        composerField: Math.min(COMPOSER_FIELDS.length - 1, state.composerField + 1),
      };
      return;
    }
    const field = COMPOSER_FIELDS[state.composerField] as ComposerField;
    if (matchesKey(data, "left")) {
      composer = nudgeComposer(composer, field, -1);
      return;
    }
    if (matchesKey(data, "right")) {
      composer = nudgeComposer(composer, field, 1);
      return;
    }
    if (matchesKey(data, "enter")) {
      const ok = applyMotionAssignment(
        rt,
        ctx.cwd ?? process.cwd(),
        composer.assignEvent,
        composer.id,
      );
      notify(
        ok,
        `Motion ${composer.assignEvent}: ${composer.id}`,
        `Motion ${composer.id} (not persisted)`,
      );
      state = { ...state, composerOpen: false, assignEvent: composer.assignEvent };
      composer = null;
    }
  }
}
