import { sanitizeSkillName, writeSkillFromTemplate } from "../../skills/skill-templates.ts";
import { composeWizardSkill } from "../../skills/workbench.ts";
import { insertSkillBody, readSkillBody } from "../../skills/skill-registry.ts";
import type { RuntimeState } from "../../core/types.ts";
import { config } from "../../core/state.ts";
import { buildDeckSessionSnapshot } from "./session-snapshot.ts";
import { applyDeckInput, type DeckAction } from "./input.ts";
import { renderDeckFrame } from "./render.ts";
import { deckRouteIndex } from "./routes.ts";
import {
  defaultAppearanceState,
  defaultSkillsState,
  type DeckNavState,
  type DeckRoute,
  type DeckSessionSnapshot,
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

export function performDeckAction(
  action: DeckAction,
  rt: RuntimeState,
  ctx: any,
  snapshot: DeckSessionSnapshot,
): "close" | "continue" {
  if (action.type === "close") return "close";
  if (action.type === "appearance") {
    config.appearance = action.mix;
    rt.lastLayoutResult = null;
    rt.tuiRef?.requestRender();
    return "continue";
  }
  if (action.type === "policy") {
    rt.motionPolicy = { ...rt.motionPolicy, level: action.level };
    rt.lastLayoutResult = null;
    return "continue";
  }
  if (action.type === "wizard-complete") {
    try {
      const name = sanitizeSkillName(action.wizard.name);
      writeSkillFromTemplate(
        name,
        action.wizard.template,
        undefined,
        composeWizardSkill(action.wizard),
      );
      ctx.ui.notify(`Created skill ${name}`, "info");
    } catch (error) {
      ctx.ui.notify(
        error instanceof Error ? error.message : String(error),
        "error",
      );
    }
    return "continue";
  }
  if (action.type === "insert-skill") {
    const summaries = snapshot.skillSummaries ?? [];
    if (summaries.length === 0) return "continue";
    const index = Math.max(0, Math.min(action.index, summaries.length - 1));
    const skill = summaries[index];
    if (skill?.filePath) {
      insertSkillBody(ctx, skill.name, readSkillBody(skill.filePath));
      ctx.ui.notify("Skill inserted into your prompt", "info");
      return "close";
    }
    if (skill?.bodyPreview) {
      insertSkillBody(ctx, skill.name, skill.bodyPreview);
      ctx.ui.notify("Skill inserted into your prompt", "info");
      return "close";
    }
  }
  return "continue";
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
      const snapshot = refreshSnapshot();
      const result = applyDeckInput(
        state,
        data,
        config.appearance,
        snapshot.skillSummaries?.length ?? 0,
      );
      state = result.state;
      if (performDeckAction(result.action, rt, ctx, snapshot) === "close") {
        done();
      }
    },
    dispose() {},
  };
}
