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
import { readSettings, writeSettingKey } from "../settings/settings-io.ts";
import { isRecord } from "../settings/settings-io.ts";
import { reloadPowerlineFromSettings } from "./appearance-write.ts";
import {
  buildConfigGroups,
  type ConfigGroup,
  type ConfigItem,
  type ConfigValue,
} from "./wishcraft-config-items.ts";

export type { ConfigGroup, ConfigItem, ConfigValue };
export { buildConfigGroups };

/** Nested read: "wishcraft.hooksEnabled" → settings.wishcraft.hooksEnabled. */
export function readConfigPath(settings: Record<string, unknown>, path: string): ConfigValue {
  let cur: unknown = settings;
  for (const part of path.split(".")) {
    if (!isRecord(cur)) return null;
    cur = cur[part];
  }
  if (typeof cur === "boolean" || typeof cur === "string" || typeof cur === "number")
    return cur;
  return null;
}

/** True for path segments that would mutate Object.prototype. */
export function isUnsafeConfigKey(key: string): boolean {
  return key === "__proto__" || key === "constructor" || key === "prototype";
}

/**
 * Set `parts` (after the root key) on `root`. Returns false and leaves
 * `root` unchanged when a segment is `__proto__`, `constructor`, or `prototype`.
 */
export function assignNestedConfigValue(
  root: Record<string, unknown>,
  parts: string[],
  value: ConfigValue,
): boolean {
  for (const part of parts) {
    if (part === "__proto__" || part === "constructor" || part === "prototype") {
      return false;
    }
  }
  let node = root;
  for (let i = 0; i < parts.length; i++) {
    const key = parts[i]!;
    // Guard in this loop so CodeQL sees the key check next to the assignment.
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      return false;
    }
    if (i === parts.length - 1) {
      if (value === null) delete node[key];
      else node[key] = value;
    } else {
      if (!isRecord(node[key])) node[key] = {};
      node = node[key] as Record<string, unknown>;
    }
  }
  return true;
}

/** Nested write (new object per level) + persist to settings.json.
 * An empty string for a text field means "clear" — the key is removed from settings
 * so the code falls through to the default. */
export function writeConfigPath(
  cwd: string,
  path: string,
  value: ConfigValue,
): boolean {
  const parts = path.split(".");
  const rootKey = parts[0]!;
  if (!rootKey || parts.some(isUnsafeConfigKey)) {
    return false;
  }
  return writeSettingKey(cwd, rootKey, (existing) => {
    // Shorthand string under powerline (e.g. "chef") is a preset name: keep it.
    const node: Record<string, unknown> = isRecord(existing)
      ? existing
      : rootKey === "powerline" && typeof existing === "string"
        ? { preset: existing }
        : {};
    if (!assignNestedConfigValue(node, parts.slice(1), value)) {
      return existing;
    }
    return node;
  });
}

// ---------------------------------------------------------------------------
// Overlay
// ---------------------------------------------------------------------------

const LIST_ROWS = 14;

function isPrintable(data: string): boolean {
  return data.length === 1 && data >= " " && data <= "~";
}

/** Value shown for a config item given its stored value. */
export function displayValue(item: ConfigItem, value: ConfigValue): string {
  // An unset toggle renders as its declared default (read hints default on).
  if (item.kind === "toggle" && (value === null || value === undefined)) {
    return (item.default ?? false) ? "on" : "off";
  }
  if (value === null || value === undefined || value === "") return item.kind === "toggle" ? "off" : "—";
  if (item.kind === "toggle") return value ? "on" : "off";
  return String(value);
}

/** Next stored boolean after toggling `item` from its current `value`. */
export function nextToggleValue(item: ConfigItem, value: ConfigValue): boolean {
  const effective =
    item.kind === "toggle" && value === null ? (item.default ?? false) : value === true;
  return !effective;
}

function coerce(item: ConfigItem, current: ConfigValue, next: string): ConfigValue {
  if (item.kind === "number") {
    const n = Number.parseInt(next, 10);
    return Number.isFinite(n) ? n : current;
  }
  return next;
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
        else value = coerce(item, readConfigPath(settings, item.path), next);
        const ok = writeConfigPath(cwd, item.path, value);
        settings = readSettings(cwd);
        groups = buildConfigGroups(settings);
        if (item.path.startsWith("powerline")) {
          reloadPowerlineFromSettings(rt, settings);
        }
        ctx.ui.notify(
          ok ? `${item.label}: ${displayValue(item, value)} (saved)` : `${item.label} not saved (settings.json?)`,
          ok ? "info" : "warning",
        );
      };

      const cycleSelect = (item: ConfigItem, forward: boolean) => {
        const cur = readConfigPath(settings, item.path);
        const list = item.choices ?? [];
        const idx = list.indexOf(String(cur ?? list[0]));
        const next = list[(idx + (forward ? 1 : list.length - 1) + list.length) % list.length]!;
        const ok = writeConfigPath(cwd, item.path, next);
        settings = readSettings(cwd);
        groups = buildConfigGroups(settings);
        if (item.path.startsWith("powerline")) {
          reloadPowerlineFromSettings(rt, settings);
        }
        ctx.ui.notify(
          ok ? `${item.label}: ${next} (saved)` : `${item.label} not saved`,
          ok ? "info" : "warning",
        );
      };

      const toggle = (item: ConfigItem) => {
        const cur = readConfigPath(settings, item.path);
        const ok = writeConfigPath(cwd, item.path, nextToggleValue(item, cur));
        settings = readSettings(cwd);
        groups = buildConfigGroups(settings);
        if (item.path.startsWith("powerline")) {
          reloadPowerlineFromSettings(rt, settings);
        }
        ctx.ui.notify(
          ok ? `${item.label}: ${!(cur === true) ? "on" : "off"} (saved)` : `${item.label} not saved`,
          ok ? "info" : "warning",
        );
      };

      return {
        render: (width: number) => {
          const innerWidth = Math.max(1, width - 2);
          const lines: string[] = [];
          lines.push(border(`╭${"─".repeat(innerWidth)}╮`));
          lines.push(
            wrapRow(theme.fg("accent", theme.bold("Wishcraft · configuration")), innerWidth),
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
            const shown = editing && isSel ? editBuffer + "▏" : displayValue(row.item, value);
            const prefix = isSel ? (editing ? "✎ " : "→ ") : "  ";
            const name = isSel
              ? theme.fg("accent", `${prefix}${row.item.label}`)
              : theme.fg("text", `${prefix}${row.item.label}`);
            const val = theme.fg(editing && isSel ? "accent" : "muted", shown);
            const pad = " ".repeat(Math.max(1, innerWidth - row.item.label.length - shown.length - 8));
            lines.push(wrapRow(`${name}${pad}${val}`, innerWidth));
          }
          if (start > 0 || end < rows.length) {
            lines.push(wrapRow(theme.fg("dim", `(${selected}/${rows.length})`), innerWidth));
          }

          lines.push(border(`├${"─".repeat(innerWidth)}┤`));
          lines.push(
            wrapRow(
              theme.fg(
                "dim",
                editing
                  ? "type=value · enter=save · esc=cancel"
                  : "↑↓ · enter=select/edit (←→ cycles) · esc=close",
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
    description: "Open the Wishcraft Deck, or settings/config for the flat list",
    handler: async (args: string, ctx: any) => {
      if (!rt.enabled || !ctx.hasUI) {
        ctx.ui.notify("Signal UI is disabled", "info");
        return;
      }
      rt.currentCtx = ctx;
      const trimmed = args?.trim() ?? "";
      if (trimmed === "config" || trimmed === "settings") {
        await showWishcraftConfig(rt, ctx);
        return;
      }
      await openWishcraftDeck(rt, ctx, parseDeckRouteArg(trimmed));
    },
  });
}
