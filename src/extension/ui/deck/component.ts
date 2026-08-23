import { matchesKey } from "@earendil-works/pi-tui";
import { STRUCTURAL_PRESET_NAMES } from "../../../config/types.ts";
import { applyAppearanceBase } from "../../settings/appearance-write.ts";
import {
  applyOverlayQueryKey,
  isOverlayPrintable,
} from "../overlay-chrome.ts";
import type { RuntimeState } from "../../core/types.ts";
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

  const setRoute = (route: DeckRoute): void => {
    const jumpingToAppearance = route === "appearance" && state.route !== "appearance";
    state = {
      ...state,
      route,
      selectedNav: deckRouteIndex(route),
      selectedAppearance: jumpingToAppearance
        ? appearanceIndex(refreshSnapshot().appearanceBase)
        : state.selectedAppearance,
    };
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
      );
    },
    handleInput(data: string) {
      if (matchesKey(data, "escape")) {
        if (state.searchOpen) {
          state = { ...state, searchOpen: false, searchQuery: "" };
          return;
        }
        done();
        return;
      }

      if (data === "/") {
        state = { ...state, searchOpen: true };
        return;
      }

      if (state.searchOpen) {
        const next = applyOverlayQueryKey(state.searchQuery, data);
        if (next !== null) {
          state = { ...state, searchQuery: next };
          const matches = filterDeckRoutes(next);
          if (matches.length === 1) {
            state = { ...state, searchOpen: false, searchQuery: "" };
            setRoute(matches[0]!);
          }
          return;
        }
        if (matchesKey(data, "enter")) {
          const matches = filterDeckRoutes(state.searchQuery);
          if (matches[0]) {
            state = { ...state, searchOpen: false, searchQuery: "" };
            setRoute(matches[0]);
          }
        }
        return;
      }

      if (data === "g") {
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

      if (state.route === "appearance") {
        if (matchesKey(data, "up")) {
          state = {
            ...state,
            selectedAppearance: Math.max(0, state.selectedAppearance - 1),
          };
          return;
        }
        if (matchesKey(data, "down")) {
          state = {
            ...state,
            selectedAppearance: Math.min(
              STRUCTURAL_PRESET_NAMES.length - 1,
              state.selectedAppearance + 1,
            ),
          };
          return;
        }
        if (matchesKey(data, "enter")) {
          const name = STRUCTURAL_PRESET_NAMES[state.selectedAppearance];
          if (name) {
            const cwd = ctx.cwd ?? process.cwd();
            const ok = applyAppearanceBase(rt, cwd, name);
            ctx.ui.notify(
              ok ? `Appearance: ${name}` : `Appearance: ${name} (not persisted)`,
              ok ? "info" : "warning",
            );
          }
          return;
        }
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
}
