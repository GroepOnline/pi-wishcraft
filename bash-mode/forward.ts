/**
 * Forward state for bash v2 (U4). Pure reducer: given a ForwardState and
 * raw input data, decide what the PTY session should do (stdin, interrupt,
 * nothing) and what the new state should be. The BashForwardEditor drives
 * this; it has no TUI imports so the unit is fully testable.
 */

import { matchesKey } from "@earendil-works/pi-tui";

export interface ForwardState {
  running: boolean;
  lastExitCode: number | null;
  cwd: string;
}

export type PtyAction = "stdin" | "interrupt";

export interface ForwardDecision {
  state: ForwardState;
  ptyAction?: PtyAction;
}

const DONE_SENTINEL = "__PI_DONE__";

export function createForwardState(): ForwardState {
  return { running: false, lastExitCode: null, cwd: "" };
}

function parseSentinel(data: string): { exitCode: number; cwd: string } | null {
  if (!data.startsWith(`${DONE_SENTINEL}:`)) return null;
  const rest = data.slice(DONE_SENTINEL.length + 1);
  const colon = rest.indexOf(":");
  if (colon === -1) return null;
  const exitCode = Number.parseInt(rest.slice(0, colon), 10);
  const cwd = rest.slice(colon + 1);
  if (!Number.isFinite(exitCode)) return null;
  return { exitCode, cwd };
}

export function handleForwardInput(
  state: ForwardState,
  data: string,
): ForwardDecision {
  if (data.length === 0) return { state };

  const sentinel = parseSentinel(data);
  if (sentinel) {
    return {
      state: {
        running: false,
        lastExitCode: sentinel.exitCode,
        cwd: sentinel.cwd,
      },
    };
  }

  if (!state.running) return { state };

  if (matchesKey(data, "ctrl+c") || data === "\x03") {
    return { state, ptyAction: "interrupt" };
  }

  return { state, ptyAction: "stdin" };
}
