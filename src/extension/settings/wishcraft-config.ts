/**
 * wishcraft-config.ts
 * ---------------------------------------------------------------------------
 * `/wishcraft` — one configuration TUI for every wishcraft setting:
 * grouped, directly editable (toggle, choice, text, number), written live
 * to settings and visible immediately. Data-driven: settings are declared
 * as ConfigItem[]; the overlay renders and edits them generically.
 * ---------------------------------------------------------------------------
 */

import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import type { RuntimeState } from "../core/types.ts";
import { openWishcraftDeck } from "../ui/deck/index.ts";
import { parseDeckRouteArg } from "../ui/deck/routes.ts";
import { readSettings } from "../settings/settings-io.ts";
import {
  effectiveSettingValue,
  explainSettingValue,
  settingHint,
  settingLabel,
  validationProblem,
} from "../../config/settings-registry.ts";
import { syncLocaleFromSettings, tr } from "../../i18n/index.ts";
import { renderPowerlinePrimaryLines } from "../ui/status-line-renderers.ts";
import { reloadPowerlineFromSettings } from "./appearance-write.ts";
import {
  coerceConfigValue,
  displayValue,
  nextToggleValue,
  readConfigPath,
  writeConfigPath,
} from "./config-paths.ts";
import { runConfigDoctor } from "./config-doctor.ts";
import { runSetupWizard } from "./setup-wizard.ts";
import {
  buildConfigGroups,
  type ConfigGroup,
  type ConfigItem,
  type ConfigValue,
} from "./wishcraft-config-items.ts";

export type { ConfigGroup, ConfigItem, ConfigValue };
export { buildConfigGroups };
// Path helpers live next door (and are re-exported here to keep the import
// path stable for tests and existing callers).
export {
  assignNestedConfigValue,
  coerceConfigValue,
  displayValue,
  isUnsafeConfigKey,
  nextToggleValue,
  readConfigPath,
  writeConfigPath,
  type CoerceResult,
} from "./config-paths.ts";

// ---------------------------------------------------------------------------
// Overlay
// ---------------------------------------------------------------------------

const LIST_ROWS = 12;

function isPrintable(data: string): boolean {
  return data.length === 1 && data >= " " && data <= "~";
}

/**
 * Current status line as rows for the overlay preview.
 *
 * Fault-isolated: the preview is decoration, so a render failure must never
 * take the settings editor down with it.
 */
export function safeStatusPreview(
  rt: RuntimeState,
  width: number,
  theme: Theme,
): string[] {
  if (!rt.currentCtx) return [];
  try {
    return renderPowerlinePrimaryLines(rt, width, theme);
  } catch {
    return [];
  }
}

export async function showWishcraftConfig(rt: RuntimeState, ctx: any): Promise<void> {
  const cwd = ctx.cwd ?? process.cwd();
  let settings = readSettings(cwd);
  let groups = buildConfigGroups(settings);

  // flat row list: group titles + items
  type Row =
    | { type: "group"; title: string }
    | { type: "item"; group: number; item: ConfigItem };
  const buildRows = (): Row[] => {
    const rows: Row[] = [];
    groups.forEach((g, gi) => {
      rows.push({ type: "group", title: g.title });
      g.items.forEach((item) => rows.push({ type: "item", group: gi, item }));
    });
    return rows;
  };

  await ctx.ui.custom(
    (tui: any, theme: Theme, _kb: any, done: (r: null) => void) => {
      const border = (t: string) => theme.fg("dim", t);
      const wrapRow = (t: string, w: number) =>
        `${border("│")}${truncateToWidth(t, w, "…", true)}${border("│")}`;

      let selected = 1; // first item (row 0 is a group title)
      let editing = false;
      let editBuffer = "";

      const currentItem = (): { group: number; item: ConfigItem } | null => {
        const rows = buildRows();
        const row = rows[selected];
        return row && row.type === "item" ? row : null;
      };

      const applyEdit = (next: string) => {
        const cur = currentItem();
        if (!cur) return;
        const { item } = cur;
        let value: ConfigValue;
        if (item.kind === "toggle") value = next === "on";
        else {
          const coerced = coerceConfigValue(
            item,
            readConfigPath(settings, item.path),
            next,
          );
          if (!coerced.ok) {
            ctx.ui.notify(coerced.reason, "warning");
            tui.requestRender();
            return;
          }
          value = coerced.value;
        }
        const ok = writeConfigPath(cwd, item.path, value);
        settings = readSettings(cwd);
        syncLocaleFromSettings(settings);
        groups = buildConfigGroups(settings);
        if (item.path.startsWith("powerline")) {
          reloadPowerlineFromSettings(rt, settings);
        }
        ctx.ui.notify(
          ok
            ? `${settingLabel(item)}: ${displayValue(item, value)} (${tr("config.saved", "saved")})`
            : `${settingLabel(item)} ${tr("config.notSaved", "not saved (settings.json?)")}`,
          ok ? "info" : "warning",
        );
        // The preview reads `config`, so repaint right after it reloaded.
      };

      const cycleSelect = (item: ConfigItem, forward: boolean) => {
        if (item.kind !== "select") return;
        const cur = readConfigPath(settings, item.path);
        const list = item.choices;
        const effective = cur ?? item.defaultValue ?? list[0];
        const idx = list.indexOf(String(effective));
        const next = list[(idx + (forward ? 1 : list.length - 1) + list.length) % list.length]!;
        const ok = writeConfigPath(cwd, item.path, next);
        settings = readSettings(cwd);
        syncLocaleFromSettings(settings);
        groups = buildConfigGroups(settings);
        if (item.path.startsWith("powerline")) {
          reloadPowerlineFromSettings(rt, settings);
        }
        ctx.ui.notify(
          ok
            ? `${settingLabel(item)}: ${next} (${tr("config.saved", "saved")})`
            : `${settingLabel(item)} ${tr("config.notSaved", "not saved")}`,
          ok ? "info" : "warning",
        );
      };

      const toggle = (item: ConfigItem) => {
        const cur = readConfigPath(settings, item.path);
        const next = nextToggleValue(item, cur);
        const ok = writeConfigPath(cwd, item.path, next);
        settings = readSettings(cwd);
        syncLocaleFromSettings(settings);
        groups = buildConfigGroups(settings);
        if (item.path.startsWith("powerline")) {
          reloadPowerlineFromSettings(rt, settings);
        }
        ctx.ui.notify(
          ok
            ? `${settingLabel(item)}: ${next ? tr("config.on", "on") : tr("config.off", "off")} (${tr("config.saved", "saved")})`
            : `${settingLabel(item)} ${tr("config.notSaved", "not saved")}`,
          ok ? "info" : "warning",
        );
      };

      return {
        render: (width: number) => {
          const innerWidth = Math.max(1, width - 2);
          const lines: string[] = [];
          lines.push(border(`╭${"─".repeat(innerWidth)}╮`));
          lines.push(
            wrapRow(
              theme.fg("accent", theme.bold(tr("config.title", "Wishcraft · configuration"))),
              innerWidth,
            ),
          );
          lines.push(border(`├${"─".repeat(innerWidth)}┤`));

          const rows = buildRows();
          // scroll window around the selection
          let start = Math.max(0, selected - Math.floor(LIST_ROWS / 2));
          let end = Math.min(start + LIST_ROWS, rows.length);
          if (end - start < Math.min(LIST_ROWS, rows.length)) start = Math.max(0, end - LIST_ROWS);

          for (let i = start; i < end; i++) {
            const row = rows[i]!;
            if (row.type === "group") {
              lines.push(wrapRow(theme.fg("dim", `── ${row.title} ──`), innerWidth));
              continue;
            }
            const isSel = i === selected;
            const value = readConfigPath(settings, row.item.path);
            const label = settingLabel(row.item);
            // A stored value that fails validation is marked inline instead of
            // being silently replaced by the default — the operator can see
            // the damage before opening the diagnostics route.
            const stored = value !== null;
            const storedInvalid =
              stored && !explainSettingValue(row.item, value).ok;
            const flag = storedInvalid ? "⚠ " : "";
            const shown = editing && isSel ? editBuffer + "▏" : displayValue(row.item, value);
            const prefix = isSel ? (editing ? "✎ " : "→ ") : "  ";
            const name = isSel
              ? theme.fg(storedInvalid ? "warning" : "accent", `${prefix}${flag}${label}`)
              : theme.fg(storedInvalid ? "warning" : "text", `${prefix}${flag}${label}`);
            const val = theme.fg(editing && isSel ? "accent" : "muted", shown);
            const pad = " ".repeat(Math.max(1, innerWidth - label.length - shown.length - 8));
            lines.push(wrapRow(`${name}${pad}${val}`, innerWidth));
          }
          if (start > 0 || end < rows.length) {
            lines.push(wrapRow(theme.fg("dim", `(${selected}/${rows.length})`), innerWidth));
          }

          // Contextual hint for the selected setting: why it exists, or the
          // validation problem that is currently being tolerated.
          const selRow = rows[selected];
          if (selRow?.type === "item") {
            const storedValue = readConfigPath(settings, selRow.item.path);
            const problem =
              storedValue !== null
                ? validationProblem(
                    selRow.item,
                    storedValue,
                    effectiveSettingValue(selRow.item, storedValue),
                  )
                : null;
            const hint =
              problem ??
              settingHint(selRow.item) ??
              (selRow.item.restartRequired
                ? tr("config.restartNeeded", "restart required to take effect")
                : null);
            if (hint) lines.push(wrapRow(theme.fg("dim", hint), innerWidth));
          }

          // Live status line: every change repaints this, so the operator sees
          // the real result instead of guessing what a setting does.
          const preview = safeStatusPreview(rt, innerWidth, theme);
          if (preview.length > 0) {
            lines.push(
              wrapRow(
                theme.fg("dim", `── ${tr("config.preview", "live status line")} ──`),
                innerWidth,
              ),
            );
            for (const line of preview) {
              lines.push(wrapRow(line, innerWidth));
            }
          }

          lines.push(border(`├${"─".repeat(innerWidth)}┤`));
          lines.push(
            wrapRow(
              theme.fg(
                "dim",
                editing
                  ? tr("config.hint.editing", "type=value · enter=save · esc=cancel")
                  : tr("config.hint.browsing", "↑↓ · enter=select/edit (←→ cycles) · esc=close"),
              ),
              innerWidth,
            ),
          );
          lines.push(border(`╰${"─".repeat(innerWidth)}╯`));
          return lines;
        },

        invalidate: () => {},

        handleInput: (data: string) => {
          const rows = buildRows();
          if (editing) {
            if (matchesKey(data, "escape")) {
              editing = false;
              editBuffer = "";
            } else if (matchesKey(data, "enter")) {
              // Save even if empty — allows clearing a field (e.g. remove a shortcut binding)
              applyEdit(editBuffer.trim());
              editing = false;
              editBuffer = "";
            } else if (matchesKey(data, "backspace")) {
              editBuffer = editBuffer.slice(0, -1);
            } else if (data === "\x15") {
              editBuffer = "";
            } else if (isPrintable(data)) {
              editBuffer += data;
            }
            tui.requestRender();
            return;
          }

          if (matchesKey(data, "escape") || data === "\x03") {
            done(null);
            return;
          }
          if (matchesKey(data, "up")) {
            do {
              selected = selected === 0 ? rows.length - 1 : selected - 1;
            } while (rows[selected]!.type === "group");
          } else if (matchesKey(data, "down")) {
            do {
              selected = selected === rows.length - 1 ? 0 : selected + 1;
            } while (rows[selected]!.type === "group");
          } else if (matchesKey(data, "pageUp")) {
            selected = Math.max(1, selected - LIST_ROWS);
            // do not land on a group header: skip to the next item
            while (selected < rows.length - 1 && rows[selected]!.type === "group")
              selected++;
          } else if (matchesKey(data, "pageDown")) {
            selected = Math.min(rows.length - 1, selected + LIST_ROWS);
            while (selected > 1 && rows[selected]!.type === "group") selected--;
          } else {
            const cur = currentItem();
            if (!cur) return;
            const { item } = cur;
            if (matchesKey(data, "enter") || matchesKey(data, "right")) {
              if (item.kind === "toggle") toggle(item);
              else if (item.kind === "select" && item.choices) cycleSelect(item, true);
              else {
                editing = true;
                const v = readConfigPath(settings, item.path);
                editBuffer = v === null ? "" : String(v);
              }
            } else if (matchesKey(data, "left")) {
              if (item.kind === "select" && item.choices) cycleSelect(item, false);
              else if (item.kind === "toggle") toggle(item);
            } else if (item.kind === "toggle" && (data === " " || data === "t")) {
              toggle(item);
            }
          }
          tui.requestRender();
        },
      };
    },
    {
      overlay: true,
      overlayOptions: () => ({ verticalAlign: "center", horizontalAlign: "center" }),
    },
  );
}

/** Register /wishcraft — opens the Deck; `settings`/`config` open the flat list. */
export function registerWishcraftConfigCommand(pi: ExtensionAPI, rt: RuntimeState): void {
  pi.registerCommand("wishcraft", {
    description: tr(
      "cmd.wishcraft.desc",
      "Open the Wishcraft Deck, or settings/config/setup/doctor",
    ),
    handler: async (args: string, ctx: any) => {
      if (!rt.enabled || !ctx.hasUI) {
        ctx.ui.notify(tr("cmd.signalDisabled", "Signal UI is disabled"), "info");
        return;
      }
      rt.currentCtx = ctx;
      const trimmed = args?.trim() ?? "";
      if (trimmed === "config" || trimmed === "settings") {
        await showWishcraftConfig(rt, ctx);
        return;
      }
      if (trimmed === "setup") {
        await runSetupWizard(rt, ctx);
        return;
      }
      if (trimmed === "doctor" || trimmed === "diagnose") {
        await runConfigDoctor(rt, ctx);
        return;
      }
      await openWishcraftDeck(rt, ctx, parseDeckRouteArg(trimmed));
    },
  });
}
