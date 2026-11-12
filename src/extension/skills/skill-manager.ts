/**
 * skill-manager.ts
 * ---------------------------------------------------------------------------
 * Skills Manager v2 — list ⇄ detail overlay:
 *   - search that actually filters (type=filter, ctrl+u clears)
 *   - category headers (global/project/prompts/extra) + tab category filter
 *   - sort by name or usage (s), usage counts from the ledger
 *   - detail panel: metadata, frontmatter, body with scroll
 *   - e=edit (edit command in the editor via pi's ! flow),
 *     n=new skill, d=delete with confirm
 * ---------------------------------------------------------------------------
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { rmSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { openWishcraftDeck } from "../ui/deck/index.ts";
import type { RuntimeState } from "../core/types.ts";
import {
  getSkillUsage,
  invalidateSkillCache,
  loadSkillCatalog,
  insertSkillBody,
  readSkillBody,
  type SkillEntry,
} from "./skill-registry.ts";
import { runSkillDoctor } from "./skill-doctor.ts";
import { runSkillsNew } from "./skill-templates.ts";
import {
  appendToEditor,
  createSkillManagerViewState,
  editorCommand,
  filteredEntries,
  isContainedInSkillRoots,
} from "./skill-manager-utils.ts";
import { renderSkillManagerView } from "./skill-manager-view.ts";
import { handleSkillManagerInput } from "./skill-manager-input.ts";

// Re-exports for existing importers/tests — the helpers now live in
// skill-manager-utils.ts, this module stays the public face.
export { isContainedInSkillRoots, safeEditor } from "./skill-manager-utils.ts";


export async function showSkillManager(ctx: any): Promise<"new" | null> {
  invalidateSkillCache();
  let entries = loadSkillCatalog(ctx.cwd ?? process.cwd());
  const usage = getSkillUsage();
  if (entries.length === 0) {
    ctx.ui.notify("No skills found", "info");
  }

  return ctx.ui.custom(
    (
      _tui: any,
      theme: Theme,
      _keybindings: any,
      done: (result: "new" | null) => void,
    ) => {
      const state = createSkillManagerViewState();

      const openDetail = (entry: SkillEntry) => {
        state.detail = entry;
        state.bodyLines = readSkillBody(entry.filePath).split("\n");
        state.scroll = 0;
        state.confirmDelete = false;
        state.mode = "detail";
      };

      const doDelete = (entry: SkillEntry) => {
        const cwd = ctx.cwd ?? process.cwd();
        try {
          if (entry.isDirectorySkill && entry.filePath.endsWith("SKILL.md") &&
              (entry.category === "global" || entry.category === "project")) {
            if (!isContainedInSkillRoots(entry.baseDir, cwd)) {
              throw new Error(`refusing to delete outside skill roots: ${entry.baseDir}`);
            }
            rmSync(entry.baseDir, { recursive: true, force: true });
          } else {
            if (!isContainedInSkillRoots(entry.filePath, cwd)) {
              throw new Error(`refusing to delete outside skill roots: ${entry.filePath}`);
            }
            rmSync(entry.filePath, { force: true });
          }
          ctx.ui.notify(`Skill deleted: ${entry.name}`, "info");
        } catch (error) {
          ctx.ui.notify(
            `Delete failed: ${error instanceof Error ? error.message : String(error)}`,
            "error",
          );
        }
        invalidateSkillCache();
        entries = loadSkillCatalog(ctx.cwd ?? process.cwd());
        state.mode = "list";
        state.confirmDelete = false;
        state.selected = Math.min(
          state.selected,
          Math.max(0, filteredEntries(state, entries, usage).length - 1),
        );
      };

      const insertBody = (entry: SkillEntry) => {
        insertSkillBody(ctx, entry.name, readSkillBody(entry.filePath));
        ctx.ui.notify("Skill inserted into your prompt", "info");
      };

      const actions = {
        done,
        openDetail,
        doDelete,
        insertBody,
        editEntry: (entry: SkillEntry) => {
          appendToEditor(
            ctx,
            editorCommand(entry.filePath),
            "Edit command in the editor — press enter to run it",
          );
          done(null);
        },
      };

      return {
        render: (width: number) =>
          renderSkillManagerView(state, { entries, usage, theme }, width),
        handleInput: (data: string) =>
          handleSkillManagerInput(
            state,
            data,
            actions,
            entries,
            usage,
            () => _tui.requestRender(),
          ),
        invalidate: () => {},
      };
    },
    {
      overlay: true,
      overlayOptions: () => ({
        verticalAlign: "center",
        horizontalAlign: "center",
      }),
    },
  );
}

export type SkillManagerCommandDeps = {
  runDoctor?: (ctx: any) => Promise<void>;
};

export function registerSkillManagerCommand(
  pi: ExtensionAPI,
  rt: RuntimeState,
  deps: SkillManagerCommandDeps = {},
): void {
  const runDoctor = deps.runDoctor ?? runSkillDoctor;
  pi.registerCommand("skills", {
    description: "Browse installed skills, or `doctor` / `new [template]`",
    handler: async (args: string, ctx: any) => {
      if (!rt.enabled || !ctx.hasUI) {
        ctx.ui.notify("Powerline UI is disabled", "info");
        return;
      }
      const sub = args?.trim().split(/\s+/)[0]?.toLowerCase();
      if (sub === "deck") {
        await openWishcraftDeck(rt, ctx, "skills");
        return;
      }
      if (sub === "doctor") {
        await runDoctor(ctx);
        return;
      }
      if (sub === "new") {
        await runSkillsNew(ctx, args);
        return;
      }
      const result = await showSkillManager(ctx);
      if (result === "new") await runSkillsNew(ctx, "");
    },
  });
}

// Re-export for existing importers/tests.
export { listSkills, readSkillBody } from "./skill-registry.ts";
