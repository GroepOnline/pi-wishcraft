import { sanitizeSkillName, writeSkillFromTemplate } from "../../skills/skill-templates.ts";
import type { RuntimeState } from "../../core/types.ts";
import { config } from "../../core/state.ts";
import { buildDeckSessionSnapshot } from "./session-snapshot.ts";
import { applyDeckInput } from "./input.ts";
import { renderDeckFrame } from "./render.ts";
import { deckRouteIndex } from "./routes.ts";
import {
  defaultAppearanceState,
  defaultSkillsState,
  type DeckNavState,
  type DeckRoute,
} from "./types.ts";

export function createDeckNavState(route: DeckRoute): DeckNavState {
  return {
    route,
    selectedNav: deckRouteIndex(route),
    searchOpen: false,
    searchQuery: "",
    pendingJump: null,
    appearance: defaultAppearanceState(),
    skills: defaultSkillsState(),
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
        rt.motionPolicy,
      );
    },
    handleInput(data: string) {
      const result = applyDeckInput(state, data, config.appearance);
      state = result.state;
      if (result.action.type === "close") {
        done();
        return;
      }
      if (result.action.type === "appearance") {
        config.appearance = result.action.mix;
        rt.lastLayoutResult = null;
        rt.tuiRef?.requestRender();
      }
      if (result.action.type === "policy") {
        rt.motionPolicy = { ...rt.motionPolicy, level: result.action.level };
        rt.lastLayoutResult = null;
      }
      if (result.action.type === "wizard-complete") {
        try {
          const name = sanitizeSkillName(result.action.wizard.name);
          writeSkillFromTemplate(name, result.action.wizard.template);
          ctx.ui.notify(`Created skill ${name}`, "info");
        } catch (error) {
          ctx.ui.notify(
            error instanceof Error ? error.message : String(error),
            "error",
          );
        }
      }
    },
    dispose() {},
  };
}
