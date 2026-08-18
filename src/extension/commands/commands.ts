import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type KeyId, type SelectItem } from "@earendil-works/pi-tui";
import { execSync } from "node:child_process";

import type { StatusLinePreset } from "../../config/types.ts";
import { PRESETS } from "../../config/presets.ts";
import { registerCdCommand } from "../../shell/cd-command.ts";
import { registerVibeCommand } from "./vibe-command.ts";
import { registerQueueCommands } from "./queue-commands.ts";
import { registerSkillManagerCommand } from "../skills/skill-manager.ts";
import { registerWishcraftConfigCommand } from "../settings/wishcraft-config.ts";
import { getRepairCounts } from "../hooks/index.ts";
import {
  writePowerlineOptionSetting,
  writePowerlinePresetSetting,
} from "../settings/settings-io.ts";
import {
  showOpenPortsList,
  showPowerlineMainMenu,
  showSelectOverlay,
} from "../ui/menu-views.ts";
import { openStashHistory } from "../shortcuts/shortcuts-router.ts";
import { ensureShellSession, setBashModeActive } from "./bash-mode-actions.ts";
import { setupCustomEditor } from "../ui/custom-editor.ts";
import { getPromptHistoryState } from "../history/prompt-history.ts";
import {
  requestStatusRender,
  resetLayoutCache,
} from "../core/segment-context.ts";
import { config, normalizePreset } from "../core/state.ts";
import type { RuntimeState } from "../core/types.ts";

export function registerCommands(pi: ExtensionAPI, rt: RuntimeState): void {
  registerCdCommand(pi, () => rt.currentCtx?.cwd ?? process.cwd());
  registerVibeCommand(pi);
  registerQueueCommands(pi, rt);
  registerSkillManagerCommand(pi, rt);
  registerWishcraftConfigCommand(pi, rt);

  // Command to toggle/configure
  pi.registerCommand("powerline", {
    description: "Configure powerline status (toggle, preset)",
    handler: async (args, ctx) => {
      // Update context reference (command ctx may have more methods)
      rt.currentCtx = ctx;

      if (!args?.trim()) {
        // Toggle
        rt.enabled = !rt.enabled;
        if (rt.enabled) {
          setupCustomEditor(pi, rt, ctx);
          ctx.ui.notify("Powerline enabled", "info");
        } else {
          rt.shellSession?.dispose();
          rt.shellSession = null;
          rt.bashTranscript.clear();
          rt.bashModeActive = false;
          rt.dismissWelcomeOverlay?.();
          rt.dismissWelcomeOverlay = null;
          rt.welcomeHeaderActive = false;
          rt.welcomeOverlayShouldDismiss = false;
          rt.welcomeDismissScheduler.cancel();
          getPromptHistoryState().savedPromptHistory = [];
          rt.stashedEditorText = null;
          ctx.ui.setStatus("stash", undefined);
          rt.restoreFooterStatusRepaintHook?.();
          rt.restoreFooterStatusRepaintHook = null;
          rt.stashShortcutInputUnsubscribe?.();
          rt.stashShortcutInputUnsubscribe = null;
          // Clear all custom UI components
          ctx.ui.setEditorComponent(undefined);
          ctx.ui.setFooter(undefined);
          ctx.ui.setHeader(undefined);
          ctx.ui.setWidget("powerline-top", undefined);
          ctx.ui.setWidget("powerline-secondary", undefined);
          ctx.ui.setWidget("powerline-bash-transcript", undefined);
          ctx.ui.setWidget("powerline-status", undefined);
          ctx.ui.setWidget("powerline-queue-preview", undefined);
          ctx.ui.setWidget("powerline-last-prompt", undefined);
          rt.footerDataRef = null;
          rt.tuiRef = null;
          rt.currentEditor = null;
          rt.statusRenderScheduler.cancel();
          resetLayoutCache(rt);
          ctx.ui.notify("Powerline disabled", "info");
        }
        return;
      }

      const normalizedArgs = args.trim().toLowerCase();
      const placementMatch = /^placement(?:\s+(above|below|toggle))?$/.exec(
        normalizedArgs,
      );
      if (placementMatch) {
        const requestedPlacement = placementMatch[1];
        config.placement =
          requestedPlacement === "above" || requestedPlacement === "below"
            ? requestedPlacement
            : config.placement === "above"
              ? "below"
              : "above";
        config.invalidPlacement = null;
        if (rt.enabled && ctx.hasUI) setupCustomEditor(pi, rt, ctx);

        if (
          writePowerlineOptionSetting(
            ctx.cwd,
            { placement: config.placement },
            config.preset,
          )
        ) {
          ctx.ui.notify(
            `Powerline placement set to: ${config.placement}`,
            "info",
          );
        } else {
          ctx.ui.notify(
            `Powerline placement set to: ${config.placement} (not persisted; check settings.json)`,
            "warning",
          );
        }
        return;
      }

      const preset = normalizePreset(args);
      if (preset) {
        config.preset = preset;
        resetLayoutCache(rt);
        if (rt.enabled) {
          setupCustomEditor(pi, rt, ctx);
        }

        if (writePowerlinePresetSetting(preset, ctx.cwd)) {
          ctx.ui.notify(`Preset set to: ${preset}`, "info");
        } else {
          ctx.ui.notify(
            `Preset set to: ${preset} (not persisted; check settings.json)`,
            "warning",
          );
        }
        return;
      }

      // Show available presets
      const presetList = Object.keys(PRESETS).join(", ");
      ctx.ui.notify(`Available presets: ${presetList}`, "info");
    },
  });

  pi.registerCommand("stash-history", {
    description: "Open prompt history picker",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      if (!rt.enabled) {
        ctx.ui.notify("Powerline is disabled", "info");
        return;
      }

      await openStashHistory(rt, ctx);
    },
  });

  pi.registerCommand("bash-mode", {
    description: "Toggle sticky bash mode (on, off, toggle)",
    handler: async (args, ctx) => {
      const mode = args?.trim().toLowerCase() || "toggle";
      if (mode === "on") {
        await setBashModeActive(rt, true, ctx);
        return;
      }
      if (mode === "off") {
        await setBashModeActive(rt, false, ctx);
        return;
      }
      if (mode === "toggle") {
        await setBashModeActive(rt, !rt.bashModeActive, ctx);
        return;
      }
      ctx.ui.notify("Usage: /bash-mode [on|off|toggle]", "warning");
    },
  });

  pi.registerCommand("bash-reset", {
    description: "Reset the managed bash session",
    handler: async (_args, ctx) => {
      rt.shellSession?.dispose();
      rt.shellSession = null;
      rt.bashTranscript.clear();
      if (rt.bashModeActive) {
        try {
          await ensureShellSession(rt);
        } catch (error) {
          rt.bashModeActive = false;
          const message =
            error instanceof Error ? error.message : String(error);
          ctx.ui.notify(`Failed to restart shell session: ${message}`, "error");
          requestStatusRender(rt);
          return;
        }
      }
      requestStatusRender(rt);
      ctx.ui.notify("Bash session reset", "info");
    },
  });

  pi.registerCommand("tps", {
    description: "Show or set POWERLINE_TPS value",
    handler: async (args, ctx) => {
      rt.currentCtx = ctx;
      const value = args?.trim();
      if (!value) {
        const current = process.env.POWERLINE_TPS || "not set";
        ctx.ui.notify(`TPS: ${current}`, "info");
        return;
      }
      process.env.POWERLINE_TPS = value;
      ctx.ui.notify(`TPS set to: ${value}`, "info");
      rt.tuiRef?.requestRender();
    },
  });

  pi.registerCommand("repairs", {
    description: "Show tool-input repair stats (wishcraft harness layer)",
    handler: async (_args, ctx) => {
      const counts = getRepairCounts();
      if (counts.size === 0) {
        ctx.ui.notify("No tool-input repairs applied yet", "info");
        return;
      }
      const summary = [...counts.entries()]
        .map(([key, n]) => `${key}: ${n}×`)
        .join("  ·  ");
      ctx.ui.notify(`Repairs — ${summary}`, "info");
    },
  });

  pi.registerCommand("open-ports", {
    description: "Show open ports",
    handler: async (_args, ctx) => {
      rt.currentCtx = ctx;
      try {
        const stdout = execSync("ss -tuln", { encoding: "utf8" });
        const lines = stdout
          .split("\n")
          .filter((line) => line.trim().length > 0);
        const items: SelectItem[] = lines.slice(1).map((line) => ({
          label: line.trim(),
          value: line.trim(),
        }));
        if (items.length === 0) {
          ctx.ui.notify("No open ports found", "info");
          return;
        }
        const selected = await showSelectOverlay(
          ctx,
          "Open Ports",
          "Select a port line for details",
          items,
          Math.min(items.length, 20),
        );
        if (selected) {
          ctx.ui.notify(`Port: ${selected.value}`, "info");
        }
      } catch (error) {
        ctx.ui.notify(
          `Failed to list ports: ${error instanceof Error ? error.message : String(error)}`,
          "error",
        );
      }
    },
  });

  // Configurable powerline shortcuts (re-bound on /reload via settings.powerlineShortcuts).
  if (rt.resolvedShortcuts.menu) {
    pi.registerShortcut(rt.resolvedShortcuts.menu as KeyId, {
      description: "Powerline menu (navigate / configure / info)",
      handler: async (ctx) => {
        await showPowerlineMainMenu(rt, ctx);
      },
    });
  }
  if (rt.resolvedShortcuts.info) {
    pi.registerShortcut(rt.resolvedShortcuts.info as KeyId, {
      description: "Powerline info (full open-ports list)",
      handler: async (ctx) => {
        rt.currentCtx = ctx;
        await showOpenPortsList(ctx);
      },
    });
  }
}
