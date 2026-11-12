/** Skill-manager input lane — mutates the shared panel state via actions. */

import { matchesKey } from "@earendil-works/pi-tui";

import type { getSkillUsage, SkillEntry } from "./skill-registry.ts";
import {
  CATEGORY_ORDER,
  DETAIL_ROWS,
  filteredEntries,
  isPrintable,
  selectedEntry,
  type SkillManagerViewState,
} from "./skill-manager-utils.ts";

export interface SkillManagerActions {
  done: (result: "new" | null) => void;
  openDetail: (entry: SkillEntry) => void;
  doDelete: (entry: SkillEntry) => void;
  insertBody: (entry: SkillEntry) => void;
  /** Write `${EDITOR} <path>` into the pi editor and close the panel. */
  editEntry: (entry: SkillEntry) => void;
}

export function handleSkillManagerInput(
  state: SkillManagerViewState,
  data: string,
  actions: SkillManagerActions,
  entries: SkillEntry[],
  usage: ReturnType<typeof getSkillUsage>,
  requestRender: () => void,
): void {
  const escape = matchesKey(data, "escape");
  const up = matchesKey(data, "up");
  const down = matchesKey(data, "down");

  if (state.mode === "list") {
    const f = filteredEntries(state, entries, usage);
    if (state.confirmDelete) {
      // Confirm delete: ctrl+d or enter; any other key cancels.
      if (data === "\x04" || matchesKey(data, "enter")) {
        const entry = selectedEntry(state, entries, usage);
        if (entry) actions.doDelete(entry);
      } else {
        state.confirmDelete = false;
      }
    } else if (escape || data === "\x03") {
      actions.done(null);
      return;
    } else if (up) {
      state.selected = state.selected === 0 ? f.length - 1 : state.selected - 1;
    } else if (down) {
      state.selected = state.selected === f.length - 1 ? 0 : state.selected + 1;
    } else if (matchesKey(data, "tab")) {
      const idx = CATEGORY_ORDER.indexOf(state.category);
      state.category = CATEGORY_ORDER[(idx + 1) % CATEGORY_ORDER.length]!;
      state.selected = 0;
    } else if (data === "\x13") {
      // ctrl+s = sort
      state.sort = state.sort === "name" ? "usage" : "name";
      state.selected = 0;
    } else if (data === "\x05") {
      // ctrl+e = edit
      const entry = selectedEntry(state, entries, usage);
      if (entry) {
        actions.editEntry(entry);
        return;
      }
    } else if (data === "\x0e") {
      // ctrl+n = new skill from a template
      actions.done("new");
      return;
    } else if (data === "\x04") {
      // ctrl+d = delete (with confirm)
      if (selectedEntry(state, entries, usage)) state.confirmDelete = true;
    } else if (matchesKey(data, "enter") || matchesKey(data, "right")) {
      const entry = selectedEntry(state, entries, usage);
      if (entry) actions.openDetail(entry);
    } else if (
      isPrintable(data) ||
      matchesKey(data, "backspace") ||
      data === "\x15"
    ) {
      // typing filters; ctrl+u clears the filter
      if (data === "\x15") state.query = "";
      else if (matchesKey(data, "backspace")) state.query = state.query.slice(0, -1);
      else state.query += data;
      state.selected = 0;
    }
  } else {
    // detail mode
    if (state.confirmDelete) {
      if (data === "\x04" || matchesKey(data, "enter")) {
        if (state.detail) actions.doDelete(state.detail);
      } else {
        state.confirmDelete = false;
      }
    } else if (escape || matchesKey(data, "left")) {
      state.mode = "list";
    } else if (up) {
      state.scroll = Math.max(0, state.scroll - 1);
    } else if (down) {
      state.scroll = Math.min(
        Math.max(0, state.bodyLines.length - DETAIL_ROWS),
        state.scroll + 1,
      );
    } else if (data === "\x05") {
      // ctrl+e = edit
      if (state.detail) {
        actions.editEntry(state.detail);
        return;
      }
    } else if (data === "\x04") {
      // ctrl+d = delete
      state.confirmDelete = true;
    } else if (matchesKey(data, "enter") || matchesKey(data, "tab")) {
      if (state.detail) {
        actions.insertBody(state.detail);
        actions.done(null);
      }
      return;
    }
  }
  requestRender();
}
