import {
  appendProjectHistory,
  matchHistoryEntries,
  readGlobalShellHistory,
  readProjectHistory,
} from "../../../bash-mode/history.ts";
import { ManagedShellSession } from "../../../bash-mode/shell-session.ts";
import { requestStatusRender } from "../core/segment-context.ts";
import type { RuntimeState } from "../core/types.ts";

export const getShellPath = () => process.env.SHELL || "/bin/sh";

export const getShellCwd = (rt: RuntimeState) =>
  rt.shellSession?.state.cwd ?? rt.currentCtx?.cwd ?? process.cwd();

export const getShellHistoryEntries = (
  rt: RuntimeState,
  prefix: string,
): string[] => {
  const project = matchHistoryEntries(
    readProjectHistory(rt.currentCtx?.cwd ?? process.cwd()).map(
      (entry) => entry.command,
    ),
    prefix,
    50,
  );
  const global = matchHistoryEntries(
    readGlobalShellHistory(getShellPath()),
    prefix,
    50,
  );
  return [...new Set([...project, ...global])];
};

export const ensureShellSession = async (
  rt: RuntimeState,
): Promise<ManagedShellSession> => {
  if (!rt.shellSession) {
    rt.shellSession = new ManagedShellSession(
      getShellPath(),
      rt.currentCtx?.cwd ?? process.cwd(),
      rt.bashTranscript,
      () => requestStatusRender(rt),
      (command, cwd) =>
        appendProjectHistory(rt.currentCtx?.cwd ?? process.cwd(), command, cwd),
    );
  }
  await rt.shellSession.ensureReady();
  return rt.shellSession;
};

export const runShellCommand = async (
  rt: RuntimeState,
  command: string,
  ctx: any,
): Promise<void> => {
  try {
    const session = await ensureShellSession(rt);
    await session.runCommand(command);
    requestStatusRender(rt);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`Failed to run shell command: ${message}`, "error");
  }
};

export const setBashModeActive = async (
  rt: RuntimeState,
  value: boolean,
  ctx: any,
): Promise<void> => {
  if (value === rt.bashModeActive) return;
  if (!value && rt.shellSession?.state.running) {
    ctx.ui.notify(
      "Wait for the current shell command to finish before leaving bash mode",
      "warning",
    );
    return;
  }

  if (value) {
    try {
      const session = await ensureShellSession(rt);
      rt.bashModeActive = true;
      rt.currentEditor?.dismissBashModeUi?.();
      rt.currentEditor?.refreshGhostSuggestion?.();
      requestStatusRender(rt);
      ctx.ui.notify(`Bash mode enabled (${session.state.shellName})`, "info");
    } catch (error) {
      rt.shellSession?.dispose();
      rt.shellSession = null;
      rt.bashModeActive = false;
      requestStatusRender(rt);
      const message = error instanceof Error ? error.message : String(error);
      ctx.ui.notify(`Failed to start shell session: ${message}`, "error");
    }
    return;
  }

  rt.bashModeActive = value;
  rt.currentEditor?.dismissBashModeUi?.();
  requestStatusRender(rt);
  ctx.ui.notify("Bash mode disabled", "info");
};
