import type { RuntimeState } from "../core/types.ts";
import {
  activateSegment,
  configurePowerline,
  showOpenPortsList,
  showSegmentNavigator,
  showSelectOverlay,
} from "./menu-views.ts";
import { showTpsOverlay } from "./token-overlays.ts";
import {
  assertPowerlineMenuBounds,
  type PowerlineMenuNode,
  powerlineMenuToSelectItems,
} from "./powerline-menu.ts";

async function pickPowerlineMenuNode(
  ctx: any,
  title: string,
  nodes: PowerlineMenuNode[],
): Promise<PowerlineMenuNode | null> {
  const picked = await showSelectOverlay(
    ctx,
    title,
    "↑↓ navigate · enter open · esc back",
    powerlineMenuToSelectItems(nodes),
    Math.min(nodes.length, 12),
  );
  if (!picked) return null;
  return nodes.find((node) => node.id === picked.value) ?? null;
}

async function activatePowerlineMenuAction(
  rt: RuntimeState,
  ctx: any,
  id: string,
): Promise<void> {
  if (id === "navigate") {
    const picked = await showSegmentNavigator(rt, ctx);
    if (picked) await activateSegment(rt, ctx, picked);
    return;
  }
  if (id === "configure") {
    await configurePowerline(rt, ctx);
    return;
  }
  if (id === "ports") {
    await showOpenPortsList(ctx);
    return;
  }
  if (id === "tps") {
    await showTpsOverlay(rt, ctx);
    return;
  }
  if (id === "toggle") {
    ctx.ui.notify("Use /powerline to toggle", "info");
  }
}

import { openWishcraftDeck } from "./deck/index.ts";

/** Main powerline / Wishcraft Deck menu: opens the Deck on Alt+P */
export async function showPowerlineMainMenu(
  rt: RuntimeState,
  ctx: any,
): Promise<void> {
  rt.currentCtx = ctx;
  await openWishcraftDeck(rt, ctx, "home");
}

/** Classic Navigate / Configure / Status overlays (`/signal menu`). */
export async function showPowerlineClassicMenu(
  rt: RuntimeState,
  ctx: any,
): Promise<void> {
  rt.currentCtx = ctx;
  const nodes = assertPowerlineMenuBounds();
  const picked = await pickPowerlineMenuNode(ctx, "Signal", nodes);
  if (!picked) return;
  if (picked.children?.length) {
    const child = await pickPowerlineMenuNode(ctx, picked.label, picked.children);
    if (child) await activatePowerlineMenuAction(rt, ctx, child.id);
    return;
  }
  await activatePowerlineMenuAction(rt, ctx, picked.id);
}
