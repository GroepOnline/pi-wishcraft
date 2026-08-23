import type { DeckRoute, DeckRouteDef } from "./types.ts";
import { DECK_ROUTES } from "./types.ts";

export const DECK_ROUTE_DEFS: readonly DeckRouteDef[] = [
  { id: "home", label: "Home", jumpKey: "h", description: "Session overview and next intent" },
  { id: "signal", label: "Signal", jumpKey: "s", description: "Lane layout and live activity" },
  { id: "skills", label: "Skills", jumpKey: "k", description: "Catalog and health diagnostics" },
  { id: "ideas", label: "Ideas", jumpKey: "i", description: "Captured intents and queue" },
  { id: "guardrails", label: "Guardrails", jumpKey: "r", description: "Policy rules and enforcement" },
  { id: "shell", label: "Shell", jumpKey: "l", description: "Terminal and bash mode" },
  { id: "usage", label: "Usage", jumpKey: "u", description: "Context and token metrics" },
  { id: "appearance", label: "Appearance", jumpKey: "a", description: "Presets, palette, and chrome" },
  { id: "motion", label: "Motion", jumpKey: "m", description: "Animation gallery and sensitivity" },
  { id: "shortcuts", label: "Shortcuts", jumpKey: "c", description: "Keyboard navigation reference" },
  { id: "diagnostics", label: "Diagnostics", jumpKey: "d", description: "Environment and capability checks" },
];

export function isDeckRoute(value: string): value is DeckRoute {
  return (DECK_ROUTES as readonly string[]).includes(value);
}

export function parseDeckRouteArg(args: string | undefined): DeckRoute {
  const token = args?.trim().toLowerCase().split(/\s+/)[0] ?? "";
  if (!token || token === "home" || token === "deck") return "home";
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
