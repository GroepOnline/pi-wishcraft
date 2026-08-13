import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import {
  generateVibesBatch,
  getVibeFileCount,
  getVibeMode,
  getVibeModel,
  getVibeTheme,
  hasVibeFile,
  parseVibeGenerateArgs,
  setVibeMode,
  setVibeModel,
  setVibeTheme,
} from "../../working-vibes/index.ts";

export async function runVibeCommand(args: string, ctx: any): Promise<void> {
  const parts = args?.trim().split(/\s+/) || [];
  const subcommand = parts[0]?.toLowerCase();

  // No args: show current status
  if (!args || !args.trim()) {
    const theme = getVibeTheme();
    const mode = getVibeMode();
    const model = getVibeModel();
    let status = `Vibe: ${theme || "off"} | Mode: ${mode} | Model: ${model}`;
    if (theme && mode === "file") {
      const count = getVibeFileCount(theme);
      status += count > 0 ? ` | File: ${count} vibes` : " | File: not found";
    }
    ctx.ui.notify(status, "info");
    return;
  }

  // /vibe model [spec] - show or set model
  if (subcommand === "model") {
    const modelSpec = parts.slice(1).join(" ");
    if (!modelSpec) {
      ctx.ui.notify(`Current vibe model: ${getVibeModel()}`, "info");
      return;
    }
    // Validate format (provider/modelId)
    if (!modelSpec.includes("/")) {
      ctx.ui.notify(
        "Invalid model format. Use: provider/modelId (e.g., openai-codex/gpt-5.4-mini)",
        "error",
      );
      return;
    }
    const persisted = setVibeModel(modelSpec);
    if (persisted) {
      ctx.ui.notify(`Vibe model set to: ${modelSpec}`, "info");
    } else {
      ctx.ui.notify(
        `Vibe model set to: ${modelSpec} (not persisted; check settings.json)`,
        "warning",
      );
    }
    return;
  }

  // /vibe mode [generate|file] - show or set mode
  if (subcommand === "mode") {
    const newMode = parts[1]?.toLowerCase();
    if (!newMode) {
      ctx.ui.notify(`Current vibe mode: ${getVibeMode()}`, "info");
      return;
    }
    if (newMode !== "generate" && newMode !== "file") {
      ctx.ui.notify("Invalid mode. Use: generate or file", "error");
      return;
    }
    // Check if file exists when switching to file mode
    const theme = getVibeTheme();
    if (newMode === "file" && theme && !hasVibeFile(theme)) {
      ctx.ui.notify(
        `No vibe file for "${theme}". Run /vibe generate ${theme} first`,
        "error",
      );
      return;
    }
    const persisted = setVibeMode(newMode);
    if (persisted) {
      ctx.ui.notify(`Vibe mode set to: ${newMode}`, "info");
    } else {
      ctx.ui.notify(
        `Vibe mode set to: ${newMode} (not persisted; check settings.json)`,
        "warning",
      );
    }
    return;
  }

  // /vibe generate <theme> [count] - generate vibes and save to file
  if (subcommand === "generate") {
    const parsed = parseVibeGenerateArgs(parts.slice(1));
    if (!parsed) {
      ctx.ui.notify("Usage: /vibe generate <theme> [count]", "error");
      return;
    }

    const { theme, count } = parsed;
    ctx.ui.notify(`Generating ${count} vibes for "${theme}"...`, "info");

    const result = await generateVibesBatch(theme, count);

    if (result.success) {
      ctx.ui.notify(
        `Generated ${result.count} vibes for "${theme}" → ${result.filePath}`,
        "info",
      );
    } else {
      ctx.ui.notify(`Failed to generate vibes: ${result.error}`, "error");
    }
    return;
  }

  // /vibe off - disable
  if (subcommand === "off") {
    const persisted = setVibeTheme(null);
    if (persisted) {
      ctx.ui.notify("Vibe disabled", "info");
    } else {
      ctx.ui.notify(
        "Vibe disabled (not persisted; check settings.json)",
        "warning",
      );
    }
    return;
  }

  // /vibe <theme> - set theme (preserve original casing)
  const theme = args.trim();
  const persisted = setVibeTheme(theme);
  const mode = getVibeMode();
  if (mode === "file" && !hasVibeFile(theme)) {
    const suffix = persisted ? "" : " (not persisted; check settings.json)";
    ctx.ui.notify(
      `Vibe set to: ${theme} (file mode, but no file found - run /vibe generate ${theme})${suffix}`,
      "warning",
    );
  } else if (persisted) {
    ctx.ui.notify(`Vibe set to: ${theme}`, "info");
  } else {
    ctx.ui.notify(
      `Vibe set to: ${theme} (not persisted; check settings.json)`,
      "warning",
    );
  }
}

export function registerVibeCommand(pi: ExtensionAPI): void {
  pi.registerCommand("vibe", {
    description:
      "Set working message theme. Usage: /vibe [theme|off|mode|model|generate]",
    handler: async (args, ctx) => {
      runVibeCommand(args, ctx);
    },
  });
}
