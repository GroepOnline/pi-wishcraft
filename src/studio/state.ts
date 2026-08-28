/**
 * Pure studio state machine (U5). No TUI imports: tests drive this directly;
 * component.ts maps raw input bytes onto StudioKeyEvent and re-renders.
 */

import type { StudioKeyEvent, StudioPaneId, StudioState } from "./types.ts";

export const STUDIO_PANES: readonly StudioPaneId[] = [
  "list",
  "detail",
  "actions",
  "advice",
];

export function createStudioState(): StudioState {
  return {
    mode: "normal",
    focus: "list",
    selectedIndex: 0,
    filterQuery: "",
    confirmText: null,
    exitRequested: false,
  };
}

export function handleStudioKey(
  state: StudioState,
  event: StudioKeyEvent,
): StudioState {
  switch (state.mode) {
    case "help":
      return handleHelpKey(state, event);
    case "filter":
      return handleFilterKey(state, event);
    case "confirm":
      return handleConfirmKey(state, event);
    case "normal":
      return handleNormalKey(state, event);
  }
}

function handleHelpKey(state: StudioState, event: StudioKeyEvent): StudioState {
  if (
    event.key === "printable" && event.char === "q" ||
    event.key === "escape" ||
    event.key === "return"
  ) {
    return { ...state, mode: "normal" };
  }
  return state;
}

function handleFilterKey(state: StudioState, event: StudioKeyEvent): StudioState {
  if (event.key === "escape") {
    return { ...state, mode: "normal", filterQuery: "" };
  }
  if (event.key === "return") {
    return { ...state, mode: "normal" };
  }
  if (event.key === "backspace") {
    return { ...state, filterQuery: state.filterQuery.slice(0, -1) };
  }
  if (event.key === "printable" && event.char) {
    return { ...state, filterQuery: state.filterQuery + event.char };
  }
  return state;
}

function handleConfirmKey(state: StudioState, event: StudioKeyEvent): StudioState {
  // Confirmation resolution semantics arrive with the U7 action layer; for
  // now any escape/return leaves confirm mode without changing selection.
  if (event.key === "escape" || event.key === "return") {
    return { ...state, mode: "normal", confirmText: null };
  }
  return state;
}

function handleNormalKey(state: StudioState, event: StudioKeyEvent): StudioState {
  if (event.key === "escape" || (event.key === "printable" && event.char === "q")) {
    return { ...state, exitRequested: true };
  }
  if (event.key === "printable" && event.char === "/") {
    return { ...state, mode: "filter" };
  }
  if (event.key === "printable" && event.char === "?") {
    return { ...state, mode: "help" };
  }
  if (event.key === "tab") {
    const idx = STUDIO_PANES.indexOf(state.focus);
    const next = STUDIO_PANES[(idx + 1) % STUDIO_PANES.length]!;
    return { ...state, focus: next };
  }
  if (event.key === "down" || (event.key === "printable" && event.char === "j")) {
    return { ...state, selectedIndex: state.selectedIndex + 1 };
  }
  if (event.key === "up" || (event.key === "printable" && event.char === "k")) {
    return { ...state, selectedIndex: Math.max(0, state.selectedIndex - 1) };
  }
  return state;
}
