import { hostname as osHostname } from "node:os";
import { basename } from "node:path";
import type {
  SegmentContext,
  SemanticColor,
  StatusLineSegment,
} from "../config/types.ts";
import { applyColor } from "../theme/theme.ts";
import { getIcons, SEP_DOT, getThinkingText } from "../theme/icons.ts";
import type { IconSet } from "../theme/icons.ts";
import { getGitRemoteHost } from "../git/status.ts";
import type { GitHost } from "../git/status.ts";
import { color, withIcon, formatDuration } from "./shared.ts";

// ═══════════════════════════════════════════════════════════════════════════
// Segment Implementations
// ═══════════════════════════════════════════════════════════════════════════

export const modelSegment: StatusLineSegment = {
  id: "model",
  render(ctx) {
    const icons = getIcons();
    const opts = ctx.options.model ?? {};

    let modelName = ctx.model?.name || ctx.model?.id || "no-model";
    if (opts.display === "qualified" && ctx.model?.id) {
      const provider =
        ctx.model.provider || ctx.model.providerId || ctx.model.providerName;
      modelName =
        provider && !ctx.model.id.includes("/")
          ? `${provider}/${ctx.model.id}`
          : ctx.model.id;
    } else if (modelName.startsWith("Claude ")) {
      modelName = modelName.slice(7);
    }

    let content = withIcon(icons.model, modelName);

    if (opts.showThinkingLevel !== false && ctx.model?.reasoning) {
      const level = ctx.thinkingLevel || "off";
      if (level !== "off") {
        const thinkingText = getThinkingText(level);
        if (thinkingText) {
          content += `${SEP_DOT}${thinkingText}`;
        }
      }
    }

    return { content: color(ctx, "model", content), visible: true };
  },
};

export const shellModeSegment: StatusLineSegment = {
  id: "shell_mode",
  render(ctx) {
    if (!ctx.shellModeActive) {
      return { content: "", visible: false };
    }

    const shellName = ctx.shellName ?? "shell";
    const state = ctx.shellRunning ? "run" : "idle";
    const cwd = ctx.shellCwd ? basename(ctx.shellCwd) : null;
    const parts = [shellName, state];
    if (cwd) {
      parts.push(cwd);
    }

    return {
      content: color(ctx, "shellMode", parts.join(SEP_DOT)),
      visible: true,
    };
  },
};

export const pathSegment: StatusLineSegment = {
  id: "path",
  render(ctx) {
    const icons = getIcons();
    const opts = ctx.options.path ?? {};
    const mode = opts.mode ?? "basename";

    let pwd =
      ctx.shellModeActive && ctx.shellCwd
        ? ctx.shellCwd
        : (ctx.cwd ?? process.cwd());
    const home = process.env.HOME || process.env.USERPROFILE;

    if (mode === "basename") {
      // Just the last directory component (cross-platform)
      pwd = basename(pwd) || pwd;
    } else {
      // Abbreviate home directory for abbreviated/full modes
      if (home && pwd.startsWith(home)) {
        pwd = `~${pwd.slice(home.length)}`;
      }

      // Strip /work/ prefix (common in containers)
      if (pwd.startsWith("/work/")) {
        pwd = pwd.slice(6);
      }

      // Truncate if too long (only for abbreviated mode)
      if (mode === "abbreviated") {
        const maxLen = opts.maxLength ?? 40;
        if (pwd.length > maxLen) {
          pwd = `…${pwd.slice(-(maxLen - 1))}`;
        }
      }
    }

    const content = withIcon(icons.folder, pwd);
    return { content: color(ctx, "path", content), visible: true };
  },
};

/**
 * Icon for the branch label: the origin remote's host logo when hostIcon is
 * enabled and a remote is known, otherwise the plain branch icon. An
 * unrecognized remote falls back to the generic git logo.
 */
function resolveBranchIcon(icons: IconSet, hostIcon: boolean): string {
  if (!hostIcon) return icons.branch;
  const host = getGitRemoteHost();
  const byHost: Record<GitHost, string> = {
    github: icons.github,
    gitlab: icons.gitlab,
    bitbucket: icons.bitbucket,
    other: icons.git,
  };
  return host ? byHost[host] : icons.branch;
}

export const gitSegment: StatusLineSegment = {
  id: "git",
  render(ctx) {
    const icons = getIcons();
    const opts = ctx.options.git ?? {};
    const { branch, staged, unstaged, untracked, ahead, behind, commit } =
      ctx.git;
    const gitStatus =
      staged > 0 || unstaged > 0 || untracked > 0
        ? { staged, unstaged, untracked }
        : null;

    if (!branch && !gitStatus) return { content: "", visible: false };

    const isDirty =
      gitStatus &&
      (gitStatus.staged > 0 ||
        gitStatus.unstaged > 0 ||
        gitStatus.untracked > 0);
    const showBranch = opts.showBranch !== false;
    const branchColor: SemanticColor = isDirty ? "gitDirty" : "gitClean";

    // Build content - color branch separately from indicators
    let content = "";
    if (showBranch && branch) {
      // Color just the branch name (icon + branch text)
      const branchIcon = resolveBranchIcon(icons, opts.hostIcon === true);
      content = color(ctx, branchColor, withIcon(branchIcon, branch));
    }

    // Add status indicators (each with their own color, not wrapped)
    if (gitStatus) {
      const indicators: string[] = [];
      if (opts.showUnstaged !== false && gitStatus.unstaged > 0) {
        indicators.push(
          applyColor(ctx.theme, "warning", `*${gitStatus.unstaged}`),
        );
      }
      if (opts.showStaged !== false && gitStatus.staged > 0) {
        indicators.push(
          applyColor(ctx.theme, "success", `+${gitStatus.staged}`),
        );
      }
      if (opts.showUntracked !== false && gitStatus.untracked > 0) {
        indicators.push(
          applyColor(ctx.theme, "muted", `?${gitStatus.untracked}`),
        );
      }
      if (indicators.length > 0) {
        const indicatorText = indicators.join(" ");
        if (!content && showBranch === false) {
          // No branch shown, color the git icon with branch color
          content =
            color(ctx, branchColor, icons.git ? `${icons.git} ` : "") +
            indicatorText;
        } else {
          content += content ? ` ${indicatorText}` : indicatorText;
        }
      }
    }

    // Upstream ahead/behind commit counts (only meaningful with an upstream).
    if (opts.showAheadBehind !== false && (ahead > 0 || behind > 0)) {
      const aheadBehind = color(ctx, "separator", `↑${ahead} ↓${behind}`);
      content += content ? ` ${aheadBehind}` : aheadBehind;
    }

    // Latest commit on HEAD: short hash + truncated subject.
    if (opts.showCommit !== false && commit) {
      const maxLen = opts.maxCommitSubjectLength ?? 24;
      const subject =
        commit.subject.length > maxLen
          ? `${commit.subject.slice(0, Math.max(1, maxLen - 1))}…`
          : commit.subject;
      const commitText = color(
        ctx,
        "context",
        `#${commit.short}${subject ? ` ${subject}` : ""}`,
      );
      content += content ? ` ${commitText}` : commitText;
    }

    if (!content) return { content: "", visible: false };

    return { content, visible: true };
  },
};

export const timeSpentSegment: StatusLineSegment = {
  id: "time_spent",
  render(ctx) {
    const icons = getIcons();
    const elapsed = Date.now() - ctx.sessionStartTime;
    if (elapsed < 1000) return { content: "", visible: false };

    return {
      content: withIcon(icons.time, formatDuration(elapsed)),
      visible: true,
    };
  },
};

export const timeSegment: StatusLineSegment = {
  id: "time",
  render(ctx) {
    const icons = getIcons();
    const opts = ctx.options.time ?? {};
    const now = new Date();

    let hours = now.getHours();
    let suffix = "";
    if (opts.format === "12h") {
      suffix = hours >= 12 ? "pm" : "am";
      hours = hours % 12 || 12;
    }

    const mins = now.getMinutes().toString().padStart(2, "0");
    let timeStr = `${hours}:${mins}`;
    if (opts.showSeconds) {
      timeStr += `:${now.getSeconds().toString().padStart(2, "0")}`;
    }
    timeStr += suffix;

    return { content: withIcon(icons.time, timeStr), visible: true };
  },
};

export const sessionSegment: StatusLineSegment = {
  id: "session",
  render(ctx) {
    const icons = getIcons();
    const sessionId = ctx.sessionId;
    const display = sessionId?.slice(0, 8) || "new";

    return { content: withIcon(icons.session, display), visible: true };
  },
};

export const hostnameSegment: StatusLineSegment = {
  id: "hostname",
  render() {
    const icons = getIcons();
    const name = osHostname().split(".")[0];
    return { content: withIcon(icons.host, name), visible: true };
  },
};
