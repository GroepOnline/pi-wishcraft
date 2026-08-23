import { matchesKey } from "@earendil-works/pi-tui";
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

export function createDeckNavState(route: DeckRoute): DeckNavState {
  return {
    route,
    selectedNav: deckRouteIndex(route),
    searchOpen: false,
    searchQuery: "",
    pendingJump: null,
  };
}

export function createDeckComponent(
  rt: RuntimeState,
  ctx: any,
  initialRoute: DeckRoute,
  theme: import("@earendil-works/pi-coding-agent").Theme,
  done: () => void,
) {
  let state = createDeckNavState(initialRoute);

  const refreshSnapshot = () => buildDeckSessionSnapshot(rt, ctx);

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
            state = {
              ...state,
              route: matches[0]!,
              selectedNav: deckRouteIndex(matches[0]!),
              searchOpen: false,
              searchQuery: "",
            };
          }
          return;
        }
        if (matchesKey(data, "enter")) {
          const matches = filterDeckRoutes(state.searchQuery);
          if (matches[0]) {
            state = {
              ...state,
              route: matches[0],
              selectedNav: deckRouteIndex(matches[0]),
              searchOpen: false,
              searchQuery: "",
            };
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
        state = {
          ...state,
          pendingJump: null,
          route: route ?? state.route,
          selectedNav: route ? deckRouteIndex(route) : state.selectedNav,
        };
        return;
      }

      state = { ...state, pendingJump: null };

      if (matchesKey(data, "up")) {
        const next = Math.max(0, state.selectedNav - 1);
        state = {
          ...state,
          selectedNav: next,
          route: DECK_ROUTE_DEFS[next]?.id ?? state.route,
        };
        return;
      }
      if (matchesKey(data, "down")) {
        const next = Math.min(DECK_ROUTE_DEFS.length - 1, state.selectedNav + 1);
        state = {
          ...state,
          selectedNav: next,
          route: DECK_ROUTE_DEFS[next]?.id ?? state.route,
        };
        return;
      }

      if (data === "?") {
        state = { ...state, route: "shortcuts", selectedNav: deckRouteIndex("shortcuts") };
      }
    },
    dispose() {},
  };
}
