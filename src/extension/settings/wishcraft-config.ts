/**
 * wishcraft-config.ts
 * ---------------------------------------------------------------------------
 * `/wishcraft` — één configuratie-TUI voor álle wishcraft-instellingen:
 * overzichtelijk per groep én direct aanpasbaar (toggle, keuze, tekst,
 * getal), live weggeschreven naar settings en direct zichtbaar.
 * Data-driven: instellingen worden gedeclareerd als ConfigItem[]; de overlay
 * rendert en bewerkt ze generiek.
 * ---------------------------------------------------------------------------
 */

import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import type { RuntimeState } from "../core/types.ts";
import { readSettings, writeSettingKey } from "../settings/settings-io.ts";
import { isRecord } from "../settings/settings-io.ts";
import { config as stateConfig, setConfig, PRESET_NAMES } from "../core/state.ts";
import { parsePowerlineConfig } from "../../config/powerline-config.ts";

// ---------------------------------------------------------------------------
// Config-item declaraties
// ---------------------------------------------------------------------------

export type ConfigValue = boolean | string | number | null;

export interface ConfigItem {
  /** Label in de lijst. */
  label: string;
  /** Pad binnen settings ("powerline.placement", "wishcraft.hooksEnabled", ...). */
  path: string;
  /** Bewerkingsoptype. */
  kind: "toggle" | "select" | "text" | "number";
  /** Voor select: de keuzes. */
  choices?: string[];
  /** Hulpregels onder de groep. */
  hint?: string;
  /** Uitleg bij het item in detail (optioneel). */
  description?: string;
}

export interface ConfigGroup {
  title: string;
  items: ConfigItem[];
}

/** Genest uitlezen: "wishcraft.hooksEnabled" → settings.wishcraft.hooksEnabled. */
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

/** Genest schrijven (immutabel op elk niveau) + persist naar settings.json. */
export function writeConfigPath(
  cwd: string,
  path: string,
  value: ConfigValue,
): boolean {
  const parts = path.split(".");
  const rootKey = parts[0]!;
  // Weiger prototype-pollution keys (CodeQL).
  if (parts.some((p) => p === "__proto__" || p === "constructor" || p === "prototype")) {
    return false;
  }
  return writeSettingKey(cwd, rootKey, (existing) => {
    // Shorthand string onder powerline (bv. "chef") is een preset-naam: bewaar 'm.
    let node: Record<string, unknown> = isRecord(existing)
      ? existing
      : rootKey === "powerline" && typeof existing === "string"
        ? { preset: existing }
        : {};
    const root = node;
    for (let i = 1; i < parts.length; i++) {
      const key = parts[i]!;
      if (i === parts.length - 1) {
        if (value === null) delete node[key];
        else node[key] = value;
      } else {
        if (!isRecord(node[key])) node[key] = {};
        node = node[key] as Record<string, unknown>;
      }
    }
    return root;
  });
}

const SEPARATORS = [
  "powerline",
  "powerline-thin",
  "slash",
  "pipe",
  "block",
  "none",
  "ascii",
  "dot",
  "chevron",
  "star",
];

/** Bouw de groepen op basis van huidige settings (waarden live getoond). */
export function buildConfigGroups(settings: Record<string, unknown>): ConfigGroup[] {
  return [
    {
      title: "Statusbalk",
      items: [
        { label: "Preset", path: "powerline.preset", kind: "select", choices: ["default", "minimal", "compact", "full", "nerd", "ascii", "chef"] },
        { label: "Separator", path: "powerline.separator", kind: "select", choices: SEPARATORS },
        { label: "Plaatsing", path: "powerline.placement", kind: "select", choices: ["above", "below"] },
        { label: "Pad-modus", path: "powerline.segmentOptions.path.mode", kind: "select", choices: ["basename", "abbreviated", "full"] },
        { label: "Pad-maxlengte", path: "powerline.segmentOptions.path.maxLength", kind: "number", hint: "0 = onbeperkt" },
        { label: "Tijd formaat", path: "powerline.segmentOptions.time.format", kind: "select", choices: ["12h", "24h"] },
        { label: "Tijd seconden", path: "powerline.segmentOptions.time.showSeconds", kind: "toggle" },
        { label: "Git host-iconen", path: "powerline.segmentOptions.git.hostIcon", kind: "toggle" },
        { label: "Git ahead/behind", path: "powerline.segmentOptions.git.showAheadBehind", kind: "toggle" },
        { label: "Git laatste commit", path: "powerline.segmentOptions.git.showCommit", kind: "toggle" },
        { label: "Context formaat", path: "powerline.segmentOptions.context.format", kind: "select", choices: ["full", "percent"] },
        { label: "Cache-read formaat", path: "powerline.segmentOptions.cache_read.format", kind: "select", choices: ["tokens", "percent", "both"] },
        { label: "Kosten toning", path: "powerline.segmentOptions.cost.subscriptionDisplay", kind: "select", choices: ["subscription", "reported-cost", "both"] },
        { label: "Valuta", path: "powerline.segmentOptions.cost.currency", kind: "text" },
        { label: "Ports incl. UDP", path: "powerline.segmentOptions.openPorts.includeUdp", kind: "toggle" },
        { label: "TPS venster (ms)", path: "powerline.segmentOptions.tps.windowMs", kind: "number", hint: "default 1000" },
        { label: "TPS modus", path: "powerline.segmentOptions.tps.mode", kind: "select", choices: ["both", "out", "in"] },
        { label: "TPS label", path: "powerline.segmentLabels.tps", kind: "text", hint: "leeg = geen label" },
      ],
    },
    {
      title: "Welkom & vibes",
      items: [
        { label: "Welcome overlay", path: "powerline.welcome", kind: "toggle", hint: "aan = overlay bij opstart, uit = geen welcome" },
        { label: "Wishcraft-ballon animeren", path: "wishcraft.welcome.animateLantern", kind: "toggle", hint: "flikker-effect op de wensballon" },
      ],
    },
    {
      title: "Skills",
      items: [
        { label: "Inline-expansie /command en $skill", path: "wishcraft.inlineSkills", kind: "toggle", hint: "nog niet actief zonder herstart" },
        { label: "Read-hints", path: "wishcraft.readHints", kind: "toggle", hint: "uit = geen vervolghint na gedeeltelijke reads" },
      ],
    },
    {
      title: "Hooks & repairs (harness-laag)",
      items: [
        { label: "Hooks ingeschakeld", path: "wishcraft.hooksEnabled", kind: "toggle", hint: "commandcode-achtige preToolUse/postToolUse/sessionStart hooks" },
        { label: "Tool-input repairs", path: "wishcraft.repairsEnabled", kind: "toggle", hint: "null-for-optional, auto-link, json-array, path aliases" },
        { label: "Dagelijks tokenbudget", path: "wishcraft.tokenBudget.daily", kind: "number", hint: "kleurt cost-segment; blokkeert nooit. 0 = uit" },
      ],
    },
    {
      title: "Sneltoetsen",
      items: [
        { label: "Menu", path: "powerlineShortcuts.menu", kind: "text", hint: "bv. alt+p" },
        { label: "Info", path: "powerlineShortcuts.info", kind: "text" },
        { label: "Stash", path: "powerlineShortcuts.stashHistory", kind: "text" },
        { label: "Idee", path: "powerlineShortcuts.ideaCapture", kind: "text" },
        { label: "Queue", path: "powerlineShortcuts.queueOpen", kind: "text" },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Overlay
// ---------------------------------------------------------------------------

const LIST_ROWS = 14;

function isPrintable(data: string): boolean {
  return data.length === 1 && data >= " " && data <= "~";
}

function displayValue(item: ConfigItem, value: ConfigValue): string {
  if (value === null || value === undefined || value === "") return item.kind === "toggle" ? "uit" : "—";
  if (item.kind === "toggle") return value ? "aan" : "uit";
  return String(value);
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

  // platte rijenlijst: groepstitels + items
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

      let selected = 1; // eerste item (rij 0 is een groepstitel)
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
        if (item.kind === "toggle") value = next === "aan";
        else value = coerce(item, readConfigPath(settings, item.path), next);
        const ok = writeConfigPath(cwd, item.path, value);
        settings = readSettings(cwd);
        groups = buildConfigGroups(settings);
        // live herladen powerline-config + statusbalk
        if (item.path.startsWith("powerline")) {
          setConfig({
            ...stateConfig,
            ...parsePowerlineConfig(settings.powerline, PRESET_NAMES),
          });
          rt.tuiRef?.requestRender?.();
        }
        ctx.ui.notify(
          ok ? `${item.label}: ${displayValue(item, value)} (opgeslagen)` : `${item.label} niet opgeslagen (settings.json?)`,
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
        ctx.ui.notify(
          ok ? `${item.label}: ${next} (opgeslagen)` : `${item.label} niet opgeslagen`,
          ok ? "info" : "warning",
        );
      };

      const toggle = (item: ConfigItem) => {
        const cur = readConfigPath(settings, item.path);
        const ok = writeConfigPath(cwd, item.path, !(cur === true));
        settings = readSettings(cwd);
        groups = buildConfigGroups(settings);
        ctx.ui.notify(
          ok ? `${item.label}: ${!(cur === true) ? "aan" : "uit"} (opgeslagen)` : `${item.label} niet opgeslagen`,
          ok ? "info" : "warning",
        );
      };

      return {
        render: (width: number) => {
          const innerWidth = Math.max(1, width - 2);
          const lines: string[] = [];
          lines.push(border(`╭${"─".repeat(innerWidth)}╮`));
          lines.push(
            wrapRow(theme.fg("accent", theme.bold("Wishcraft · configuratie")), innerWidth),
          );
          lines.push(border(`├${"─".repeat(innerWidth)}┤`));

          const rows = buildRows();
          // scroll-venster rondom selectie
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
                  ? "typ=waarde · enter=opslaan · esc=annuleren"
                  : "↑↓ · enter=kiezen/bewerken (←→ wisselt) · esc=sluiten",
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
              if (editBuffer.trim() !== "") applyEdit(editBuffer.trim());
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
            // niet op een groepskop landen: schuif door naar het volgende item
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

/** Registreer /wishcraft. */
export function registerWishcraftConfigCommand(pi: ExtensionAPI, rt: RuntimeState): void {
  pi.registerCommand("wishcraft", {
    description: "Configureer alles van wishcraft in één overzicht (statusbalk, welcome, hooks, sneltoetsen)",
    handler: async (_args: string, ctx: any) => {
      if (!rt.enabled || !ctx.hasUI) {
        ctx.ui.notify("Powerline UI is disabled", "info");
        return;
      }
      rt.currentCtx = ctx;
      await showWishcraftConfig(rt, ctx);
    },
  });
}
