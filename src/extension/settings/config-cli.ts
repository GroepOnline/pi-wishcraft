/**
 * config-cli.ts
 * ---------------------------------------------------------------------------
 * `/wishcraft get|set|unset` — configuration from the pi prompt, without an
 * editor and without opening a single overlay.
 *
 * The registry (`src/config/settings-registry.ts`) is the source of truth:
 * paths, kinds, choices, bounds and operator copy all come from there, so the
 * CLI, the flat settings TUI, the setup wizard and the diagnostics view can
 * never disagree about what a setting accepts.
 *
 * Design rules:
 *   • every failure states *why* and what to type instead (validationProblem),
 *   • `set` on a structured path (layout, segments, policy…) is refused with
 *     a pointer to settings.json — CLI values are scalars by design,
 *   • the runner is the only place with side effects; everything above it is
 *     pure and unit-testable.
 * ---------------------------------------------------------------------------
 */


import {
  getSettingDefinition,
  } from "../../config/settings-registry.ts";import { tr, syncLocaleFromSettings } from "../../i18n/index.ts";import type { RuntimeState } from "../core/types.ts";import { invalidateConfigDiagnosticsCache } from "./config-diagnostics.ts";import {
  getProjectSettingsPath,
  getSettingsPath,
  readSettings,
  readSettingsFile,
} from "./settings-io.ts";import { reloadPowerlineFromSettings } from "./appearance-write.ts";import { parseMotionSettings } from "../../motion/policy.ts";// ---------------------------------------------------------------------------
// Grammar (pure)
// ---------------------------------------------------------------------------

export type ConfigCliVerb = "help" | "get" | "set" | "unset";

export type ConfigCliArgs =
  | { verb: "help" }
  | { verb: "get"; path: string }
  | { verb: "set"; path: string; value: string }
  | { verb: "unset"; path: string };

const VERB_ALIASES: Record<string, ConfigCliVerb> = {
  help: "help",
  "?": "help",
  get: "get",
  show: "get",
  set: "set",
  write: "set",
  unset: "unset",
  reset: "unset",
  clear: "unset",
};

/**
 * Recognise a config invocation. Returns `null` for anything that is not a
 * config verb so the caller can fall through to Deck routes (`ports`,
 * `motion`, …) and the settings/setup/doctor overlays.
 */
export function parseConfigCliArgs(args: string): ConfigCliArgs | null {
  const parts = args.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const verb = VERB_ALIASES[parts[0]!.toLowerCase()];
  if (!verb) return null;
  if (verb === "help") return { verb: "help" };
  const path = parts[1] ?? "";
  if (!path) return { verb, path: "" } as ConfigCliArgs;
  if (verb === "set") {
    // The value is everything after `<path>` — text settings may contain spaces.
    return { verb, path, value: parts.slice(2).join(" ") };
  }
  return { verb, path };
}

// ---------------------------------------------------------------------------
// Runner (side effects live only here)
// ---------------------------------------------------------------------------

export const CONFIG_CLI_USAGE =
  "/wishcraft get <setting> · set <setting> <value> · unset <setting> · settings · doctor";

function postWrite(rt: RuntimeState, cwd: string, path: string): void {
  const settings = readSettings(cwd);
  syncLocaleFromSettings(settings);
  invalidateConfigDiagnosticsCache();
  if (path.startsWith("powerline")) {
    reloadPowerlineFromSettings(rt, settings);
  }
  if (path.startsWith("wishcraft.motion")) {
    rt.paint.setSettings(parseMotionSettings(settings.wishcraft));
  }
}

function writeTarget(cwd: string, rootKey: string): SettingSource {
  const project = readSettingsFile(getProjectSettingsPath(cwd));
  return Object.prototype.hasOwnProperty.call(project, rootKey)
    ? "project"
    : "global";
}

/** Execute one parsed CLI invocation. Every outcome is a single notify line. */
export function runConfigCli(
  rt: RuntimeState,
  ctx: any,
  cwd: string,
  args: ConfigCliArgs,
): void {
  if (args.verb === "help") {
    ctx.ui.notify(CONFIG_CLI_USAGE, "info");
    return;
  }

  if (args.verb === "get") {
    if (!args.path) {
      ctx.ui.notify(
        tr("cli.needPath", "Usage: /wishcraft get <setting>"),
        "warning",
      );
      return;
    }
    const info = inspectSetting(
      readSettingsFile(getSettingsPath()),
      readSettingsFile(getProjectSettingsPath(cwd)),
      args.path,
    );
    ctx.ui.notify(formatSettingInfo(info), "info");
    return;
  }

  if (args.verb === "set") {
    if (!args.path) {
      ctx.ui.notify(
        tr("cli.needPathSet", "Usage: /wishcraft set <setting> <value>"),
        "warning",
      );
      return;
    }
    if (!args.value) {
      const definition = getSettingDefinition(args.path);
      const expected = definition
        ? definition.kind === "select"
          ? definition.choices.join(" · ")
          : definition.kind === "toggle"
            ? "on · off"
            : definition.kind === "number"
              ? tr("cli.numberValue", "<number>")
              : tr("cli.textValue", "<text>")
        : tr("cli.textValue", "<text>");
      ctx.ui.notify(
        tr("cli.needValue", "Usage: /wishcraft set {path} <value> — {expected}", {
          path: definition?.path ?? args.path,
          expected,
        }),
        "warning",
      );
      return;
    }

    const result = applyConfigSet(cwd, args.path, args.value);
    if (!result.ok) {
      ctx.ui.notify(result.message, "warning");
      return;
    }
    postWrite(rt, cwd, result.path);
    const target = writeTarget(cwd, result.path.split(".")[0]!);
    const suffix = result.restartRequired
      ? ` · ${tr("config.restartNeeded", "restart required to take effect")}`
      : "";
    ctx.ui.notify(
      tr("cli.saved", "{label} = {value} (saved to {target})", {
        label: result.label,
        value: result.display,
        target: sourceWord(target),
      }) + suffix,
      "info",
    );
    return;
  }

  // unset
  if (!args.path) {
    ctx.ui.notify(
      tr("cli.needPathUnset", "Usage: /wishcraft unset <setting>"),
      "warning",
    );
    return;
  }
  const result = applyConfigUnset(cwd, args.path);
  if (!result.ok) {
    ctx.ui.notify(result.message, "warning");
    return;
  }
  postWrite(rt, cwd, result.path);
  ctx.ui.notify(
    tr("cli.removed", "{label} removed — effective value: {value}", {
      label: result.label,
      value: result.effective,
    }),
    "info",
  );
}
import {
  inspectSetting,
  formatSettingInfo,
  sourceWord,
  type SettingSource,
} from "./config-cli-read.ts";
import { applyConfigSet, applyConfigUnset } from "./config-cli-write.ts";

// Public surface re-exports — the only consumer is wishcraft-config.ts.
export type { SettingSource, ConfigValueInfo } from "./config-cli-read.ts";
export { inspectSetting, formatSettingInfo } from "./config-cli-read.ts";
export { parseToggleWord, applyConfigSet, applyConfigUnset, suggestSettingPath } from "./config-cli-write.ts";
export type { ConfigSetResult, ConfigUnsetResult } from "./config-cli-write.ts";
export { getWishcraftArgumentCompletions } from "./config-cli-complete.ts";
