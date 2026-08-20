import type { RuntimeState } from "../core/types.ts";
import {
  activateSegment,
  configurePowerline,
  showOpenPortsList,
  showSegmentNavigator,
  showSelectOverlay,
} from "./menu-views.ts";
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
    const live = process.env.POWERLINE_TPS
      ? `(override ${process.env.POWERLINE_TPS})`
      : "(live 1s window)";
    ctx.ui.notify(`TPS ${live}`, "info");
    return;
  }
  if (id === "toggle") {
    ctx.ui.notify("Use /powerline to toggle", "info");
  }
}

/** Main powerline menu: three top-level overlays, Status drills down. */
export async function showPowerlineMainMenu(
  rt: RuntimeState,
  ctx: any,
): Promise<void> {
  rt.currentCtx = ctx;
  while (true) {
    const top = await pickPowerlineMenuNode(
      ctx,
      "Powerline",
      assertPowerlineMenuBounds(),
    );
    if (!top) return;
    if (top.children?.length) {
      const child = await pickPowerlineMenuNode(ctx, top.label, top.children);
      if (!child) continue;
      await activatePowerlineMenuAction(rt, ctx, child.id);
      continue;
    }
    await activatePowerlineMenuAction(rt, ctx, top.id);
    return;
  }
}
