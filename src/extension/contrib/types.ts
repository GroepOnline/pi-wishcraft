export type DeckRouteId = string;

export interface ContributedDeckRoute {
  id: DeckRouteId;
  label: string;
  description?: string;
  jumpKey?: string;
}

export interface ContributedSignalSource {
  id: string;
  label: string;
  /** Called on each Signal repaint; must not throw. */
  render?: (ctx: unknown) => string | null;
}

export interface ContributedMotion {
  id: string;
  name: string;
}
