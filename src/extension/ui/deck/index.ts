import type { RuntimeState } from "../../core/types.ts";
import { createDeckComponent } from "./component.ts";
import type { DeckRoute } from "./types.ts";

export type { DeckRoute } from "./types.ts";
export { DECK_ROUTES } from "./types.ts";
export { parseDeckRouteArg, deckRouteByJump, filterDeckRoutes } from "./routes.ts";
export { renderDeckFrame } from "./render.ts";
export { buildDeckSessionSnapshot } from "./session-snapshot.ts";
export { applyDeckInput } from "./input.ts";
export { createDeckNavState } from "./component.ts";
export { searchAppearanceConfig, applyAppearanceHit } from "./appearance.ts";

/** Open the unified Wishcraft Deck at the requested route. */
export async function openWishcraftDeck(
  rt: RuntimeState,
  ctx: any,
  route: DeckRoute = "home",
): Promise<void> {
  if (!rt.enabled || !ctx.hasUI) {
    ctx.ui.notify("Signal UI is disabled", "info");
    return;
  }
  rt.currentCtx = ctx;

  await ctx.ui.custom(
    (_tui: any, theme: any, _keybindings: any, done: () => void) =>
      createDeckComponent(rt, ctx, route, theme, done),
    {
      overlay: true,
      overlayOptions: () => ({
        verticalAlign: "center",
        horizontalAlign: "center",
      }),
    },
  );
}
