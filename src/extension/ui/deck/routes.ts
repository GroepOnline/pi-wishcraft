import type { DeckRoute, DeckRouteDef } from "./types.ts";
import { DECK_ROUTES } from "./types.ts";
import { tr } from "../../../i18n/index.ts";
import { getContributedDeckRoutes } from "../../contrib/registry.ts";

export const BUILTIN_DECK_ROUTE_DEFS: readonly DeckRouteDef[] = [
  { id: "home", label: "Home", jumpKey: "h", description: "Session overview and next intent" },
  { id: "signal", label: "Signal", jumpKey: "s", description: "Lane layout and live activity" },
  { id: "skills", label: "Skills", jumpKey: "k", description: "Catalog and health diagnostics" },
  { id: "ideas", label: "Ideas", jumpKey: "i", description: "Captured intents and queue" },
  { id: "guardrails", label: "Guardrails", jumpKey: "r", description: "Policy rules and enforcement" },
  { id: "shell", label: "Shell", jumpKey: "l", description: "Terminal and bash mode" },
  { id: "ports", label: "Ports", jumpKey: "p", description: "Listening sockets, owners and exposure" },
  { id: "usage", label: "Usage", jumpKey: "u", description: "Context and token metrics" },
  { id: "appearance", label: "Appearance", jumpKey: "a", description: "Presets, palette, and chrome" },
  { id: "motion", label: "Motion", jumpKey: "m", description: "Animation gallery and sensitivity" },
  { id: "shortcuts", label: "Shortcuts", jumpKey: "c", description: "Keyboard navigation reference" },
  { id: "diagnostics", label: "Diagnostics", jumpKey: "d", description: "Environment and capability checks" },
];

export const DECK_ROUTE_DEFS: readonly DeckRouteDef[] = BUILTIN_DECK_ROUTE_DEFS;

export function getAllDeckRouteDefs(): readonly DeckRouteDef[] {
  const contributed = getContributedDeckRoutes().map((r) => ({
    id: r.id as DeckRoute,
    label: r.label,
    jumpKey: r.jumpKey ?? "",
    description: r.description ?? "",
  }));
  // ponytail: no dedup beyond registry — built-ins win, contributed appended
  return [...BUILTIN_DECK_ROUTE_DEFS, ...contributed];
}

/** Localised label for one route def (English literal as the fallback). */
export function routeLabel(def: DeckRouteDef): string {
  return tr(`deck.${def.id}.label`, def.label);
}

/** Localised one-line description for one route def. */
export function routeDescription(def: DeckRouteDef): string {
  return tr(`deck.${def.id}.desc`, def.description);
}

/**
 * Route defs with localised `label`/`description`, for every render path.
 * Order and ids are untouched so cursor math still matches `DECK_ROUTE_DEFS`.
 */
export function localizedRouteDefs(): readonly DeckRouteDef[] {
  return getAllDeckRouteDefs().map((def) => ({
    ...def,
    label: routeLabel(def),
    description: routeDescription(def),
  }));
}

export function isDeckRoute(value: string): value is DeckRoute {
  if ((DECK_ROUTES as readonly string[]).includes(value)) return true;
  return getContributedDeckRoutes().some((r) => r.id === value);
}

export function parseDeckRouteArg(args: string | undefined): DeckRoute {
  const token = args?.trim().toLowerCase().split(/\s+/)[0] ?? "";
  if (!token || token === "home" || token === "deck") return "home";
  if (token === "settings" || token === "config") return "appearance";
  if (isDeckRoute(token)) return token;
  return "home";
}

export function deckRouteByJump(key: string): DeckRoute | null {
  const match = DECK_ROUTE_DEFS.find((route) => route.jumpKey === key);
  return match?.id ?? null;
}

export function deckRouteIndex(route: DeckRoute): number {
  return DECK_ROUTE_DEFS.findIndex((entry) => entry.id === route);
}
