import { invalidateGitBranch, invalidateGitStatus } from "../../git/status.ts";
import { requestStatusRender } from "../core/segment-context.ts";
import type { RuntimeState } from "../core/types.ts";

// Check if a bash command might change git branch
export function mightChangeGitBranch(cmd: string): boolean {
  const gitBranchPatterns = [
    /\bgit\s+(checkout|switch|branch\s+-[dDmM]|merge|rebase|pull|reset|worktree)/,
    /\bgit\s+stash\s+(pop|apply)/,
  ];
  return gitBranchPatterns.some((p) => p.test(cmd));
}

/**
 * Invalidate cached git state and schedule a status re-render when a command
 * may have changed the working tree or branch. Returns true when the command
 * matched a git-changing pattern.
 */
export function invalidateGitForCommand(
  rt: RuntimeState,
  cmd: string,
  options: { stagger?: boolean } = {},
): boolean {
  if (!mightChangeGitBranch(cmd)) {
    return false;
  }
  invalidateGitStatus();
  invalidateGitBranch();
  if (options.stagger) {
    // user_bash fires BEFORE execution, so use staggered re-renders to catch
    // both fast and slow commands after they complete.
    setTimeout(() => requestStatusRender(rt), 100);
    setTimeout(() => requestStatusRender(rt), 300);
    setTimeout(() => requestStatusRender(rt), 500);
  } else {
    // The command has completed, so start refreshing immediately.
    requestStatusRender(rt);
  }
  return true;
}
