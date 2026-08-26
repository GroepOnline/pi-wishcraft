import type { ContributedDeckRoute, ContributedSignalSource } from "./types.ts";

// ponytail: single in-memory registry, no new runtime — data/callback contracts only.
// A failing contribution never takes down Signal or Deck — callers must isolate.

const deckRoutes = new Map<string, ContributedDeckRoute>();
const signalSources = new Map<string, ContributedSignalSource>();

function isValidId(id: string): boolean {
  return /^[a-z0-9][a-z0-9-_]*$/.test(id);
}

export function registerDeckRoute(route: ContributedDeckRoute): boolean {
  if (!route || typeof route.id !== "string" || !isValidId(route.id)) return false;
  if (typeof route.label !== "string" || !route.label.trim()) return false;
  if (deckRoutes.has(route.id)) return false;
  if (route.jumpKey != null && !/^[a-z0-9]$/.test(route.jumpKey)) return false;
  deckRoutes.set(route.id, { ...route, label: route.label.trim() });
  return true;
}

export function registerSignalSource(source: ContributedSignalSource): boolean {
  if (!source || typeof source.id !== "string" || !isValidId(source.id)) return false;
  if (typeof source.label !== "string" || !source.label.trim()) return false;
  if (signalSources.has(source.id)) return false;
  signalSources.set(source.id, { ...source });
  return true;
}

export function getContributedDeckRoutes(): readonly ContributedDeckRoute[] {
  return [...deckRoutes.values()];
}

export function getContributedSignalSources(): readonly ContributedSignalSource[] {
  return [...signalSources.values()];
}

/** Test helper — clears the registry. */
export function clearContributions(): void {
  deckRoutes.clear();
  signalSources.clear();
}
