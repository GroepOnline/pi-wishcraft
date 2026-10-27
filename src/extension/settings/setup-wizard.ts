/**
 * setup-wizard.ts
 * ---------------------------------------------------------------------------
 * `/wishcraft setup` — the first-run flow.
 *
 * Instead of dumping every setting on a new operator, ask the four questions
 * that change how Wishcraft looks and behaves, then write them in one go.
 *
 * The step model and the apply logic are pure and exported so the whole flow
 * is unit-testable without a TUI; only `runSetupWizard` touches the overlay.
 * ---------------------------------------------------------------------------
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";

import type { RuntimeState } from "../core/types.ts";
import {
  getSettingDefinition,
  settingLabel,
  validateSettingValue,
  type SettingDefinition,
  type SettingValue,
} from "../../config/settings-registry.ts";
import { syncLocaleFromSettings, tr } from "../../i18n/index.ts";
import { readSettings } from "./settings-io.ts";
import { writeConfigPath } from "./config-paths.ts";
import { invalidateConfigDiagnosticsCache } from "./config-diagnostics.ts";
import { reloadPowerlineFromSettings } from "./appearance-write.ts";

export interface WizardStep {
  id: string;
  path: string;
  /** Localised prompt shown above the choice. */
  label: string;
  kind: "select" | "toggle";
  choices: readonly string[];
  defaultValue: SettingValue;
  definition: SettingDefinition;
}

/**
 * The four questions that move the needle most, in the order an operator
 * encounters them: language, look, motion, then the startup overlay.
 */
export const WIZARD_STEP_IDS = [
  "interface.language",
  "status.preset",
  "motion.level",
  "welcome.enabled",
] as const;

function buildSteps(): WizardStep[] {
  return WIZARD_STEP_IDS.map((id) => {
    const definition = getSettingDefinition(id);
    if (!definition) {
      throw new Error(`setup wizard references unknown setting: ${id}`);
    }
    const choices =
      definition.kind === "select" ? definition.choices : ["on", "off"];
    return {
      id: definition.id,
      path: definition.path,
      label: settingLabel(definition),
      kind: definition.kind === "toggle" ? "toggle" : "select",
      choices,
      defaultValue: definition.defaultValue ?? (definition.kind === "toggle" ? false : ""),
      definition,
    };
  });
}

/** Built lazily so localisation changes are reflected in the labels. */
export function wizardSteps(): WizardStep[] {
  return buildSteps();
}

export interface WizardState {
  /** Index into `wizardSteps()`; `steps.length` is the review screen. */
  step: number;
  /** Chosen value per step id, seeded from the operator's current settings. */
  values: Record<string, SettingValue>;
}

export function createWizardState(
  settings: Record<string, unknown>,
): WizardState {
  const steps = wizardSteps();
  const values: Record<string, SettingValue> = {};
  for (const step of steps) {
    const stored = readPath(settings, step.path);
    values[step.id] =
      stored !== undefined && validateSettingValue(step.definition, stored)
        ? stored
        : step.defaultValue;
  }
  return { step: 0, values };
}

function readPath(settings: Record<string, unknown>, path: string): unknown {
  let cursor: unknown = settings;
  for (const part of path.split(".")) {
    if (typeof cursor !== "object" || cursor === null || !(part in cursor)) {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
}

export function wizardStepCount(): number {
  return wizardSteps().length;
}

export function wizardIsReview(state: WizardState): boolean {
  return state.step >= wizardStepCount();
}

export function wizardProgressText(state: WizardState): string {
  const total = wizardStepCount();
  if (wizardIsReview(state)) {
    return tr("wizard.review", "Ready to write");
  }
  return tr("wizard.step", "Step {n} of {total}", {
    n: state.step + 1,
    total,
  });
}

/** Advance one step; clamps on the review screen. */
export function wizardNext(state: WizardState): WizardState {
  return { ...state, step: Math.min(state.step + 1, wizardStepCount()) };
}

export function wizardPrevious(state: WizardState): WizardState {
  return { ...state, step: Math.max(state.step - 1, 0) };
}

/** Cycle the current step's value in `direction`. */
export function wizardCycle(
  state: WizardState,
  direction: 1 | -1,
): WizardState {
  const steps = wizardSteps();
  const step = steps[state.step];
  if (!step || wizardIsReview(state)) return state;

  if (step.kind === "toggle") {
    const current = state.values[step.id] === true;
    return {
      ...state,
      values: { ...state.values, [step.id]: !current },
    };
  }

  const list = step.choices;
  const currentIndex = Math.max(0, list.indexOf(String(state.values[step.id])));
  const next =
    list[(currentIndex + direction + list.length) % list.length] ?? list[0]!;
  return { ...state, values: { ...state.values, [step.id]: next } };
}

export interface WizardRow {
  label: string;
  value: string;
  path: string;
}

/** Review-screen rows: what is about to be written, in localised terms. */
export function wizardSummary(state: WizardState): WizardRow[] {
  return wizardSteps().map((step) => ({
    label: step.label,
    value: displayWizardValue(step, state.values[step.id]),
    path: step.path,
  }));
}

export function displayWizardValue(
  step: WizardStep,
  value: SettingValue,
): string {
  if (step.kind === "toggle") {
    return value === true ? tr("config.on", "on") : tr("config.off", "off");
  }
  return String(value);
}

/**
 * Persist every chosen value. Returns `false` if any write failed, leaving
 * whatever succeeded in place — settings writes are idempotent, so a re-run
 * finishes the job rather than rolling back.
 */
export function applyWizard(
  cwd: string,
  state: WizardState,
  onPowerlineChange?: (settings: Record<string, unknown>) => void,
): boolean {
  let allOk = true;
  for (const step of wizardSteps()) {
    const value = state.values[step.id];
    if (value === undefined) continue;
    const ok = writeConfigPath(cwd, step.path, value);
    allOk = allOk && ok;
  }
  const settings = readSettings(cwd);
  syncLocaleFromSettings(settings);
  invalidateConfigDiagnosticsCache();
  onPowerlineChange?.(settings);
  return allOk;
}

// ---------------------------------------------------------------------------
// Overlay
// ---------------------------------------------------------------------------

const ROWS = 8;

/** Open the interactive setup wizard. */
export async function runSetupWizard(
  rt: RuntimeState,
  ctx: any,
): Promise<void> {
  const cwd = ctx.cwd ?? process.cwd();
  let settings = readSettings(cwd);
  let state = createWizardState(settings);

  await ctx.ui.custom(
    (tui: any, theme: Theme, _kb: any, done: (r: null) => void) => {
      const border = (t: string) => theme.fg("dim", t);
      const wrapRow = (t: string, w: number) =>
        `${border("│")}${truncateToWidth(t, w, "…", true)}${border("│")}`;

      const applyAndFinish = () => {
        const ok = applyWizard(cwd, state, (next) => {
          reloadPowerlineFromSettings(rt, next);
        });
        ctx.ui.notify(
          ok
            ? tr("wizard.done", "Setup complete — everything saved")
            : tr("wizard.failed", "Setup not saved (settings.json?)"),
          ok ? "info" : "warning",
        );
        done(null);
      };

      return {
        render: (width: number) => {
          const innerWidth = Math.max(1, width - 2);
          const steps = wizardSteps();
          const lines: string[] = [];
          lines.push(border(`╭${"─".repeat(innerWidth)}╮`));
          lines.push(
            wrapRow(
              theme.fg(
                "accent",
                theme.bold(tr("wizard.title", "Wishcraft · first setup")),
              ),
              innerWidth,
            ),
          );
          lines.push(
            wrapRow(
              theme.fg("dim", tr("wizard.subtitle", "Four choices, then you are set.")),
              innerWidth,
            ),
          );
          lines.push(border(`├${"─".repeat(innerWidth)}┤`));

          if (!wizardIsReview(state)) {
            const step = steps[state.step]!;
            lines.push(wrapRow(wizardProgressText(state), innerWidth));
            lines.push(wrapRow(theme.bold(step.label), innerWidth));
            lines.push("");

            const start = Math.max(
              0,
              Math.min(
                step.choices.length - ROWS,
                step.choices.indexOf(String(state.values[step.id])) - 2,
              ),
            );
            const end = Math.min(step.choices.length, start + ROWS);
            for (let i = start; i < end; i++) {
              const choice = step.choices[i]!;
              const active = String(state.values[step.id]) === choice;
              lines.push(
                wrapRow(
                  theme.fg(
                    active ? "accent" : "muted",
                    `${active ? "◉ " : "◇ "}${choice}`,
                  ),
                  innerWidth,
                ),
              );
            }
            lines.push(
              wrapRow(
                theme.fg("dim", tr("wizard.hint", "←→ change · enter next · esc close")),
                innerWidth,
              ),
            );
          } else {
            lines.push(
              wrapRow(theme.fg("dim", wizardProgressText(state)), innerWidth),
            );
            lines.push("");
            for (const row of wizardSummary(state)) {
              const pad = Math.max(
                1,
                innerWidth - row.label.length - row.value.length - 6,
              );
              lines.push(
                wrapRow(
                  `${theme.fg("text", row.label)}${" ".repeat(pad)}${theme.fg("accent", row.value)}`,
                  innerWidth,
                ),
              );
            }
            lines.push("");
            lines.push(
              wrapRow(
                theme.fg("dim", tr("wizard.apply", "Write to settings.json")),
                innerWidth,
              ),
            );
            lines.push(
              wrapRow(
                theme.fg("dim", tr("wizard.hintLast", "enter save · esc close")),
                innerWidth,
              ),
            );
          }

          lines.push(border(`╰${"─".repeat(innerWidth)}╯`));
          return lines;
        },

        invalidate: () => {},

        handleInput: (data: string) => {
          if (matchesKey(data, "escape") || data === "\x03") {
            done(null);
            return;
          }
          if (wizardIsReview(state)) {
            if (matchesKey(data, "enter")) applyAndFinish();
            else if (matchesKey(data, "left")) state = wizardPrevious(state);
            tui.requestRender();
            return;
          }
          if (matchesKey(data, "enter")) {
            state = wizardNext(state);
          } else if (matchesKey(data, "left")) {
            state = wizardPrevious(state);
          } else if (matchesKey(data, "right")) {
            state = wizardCycle(state, 1);
          } else if (matchesKey(data, "up")) {
            state = wizardCycle(state, -1);
          } else if (matchesKey(data, "down")) {
            state = wizardCycle(state, 1);
          } else if (data === " " || data === "t") {
            state = wizardCycle(state, 1);
          }          tui.requestRender();
        },
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
