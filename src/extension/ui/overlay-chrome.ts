/**
 * Shared overlay chrome: rounded box, accent title, dim hint, and a
 * substring filter over SelectList items (label + value + description).
 * Pi's SelectList.setFilter is prefix-only on `value`; overlays must not
 * inherit that.
 */
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  matchesKey,
  type SelectItem,
  SelectList,
  truncateToWidth,
} from "@earendil-works/pi-tui";

const NONE_VALUE = "__none__";

export function overlaySelectListTheme(theme: Theme) {
  return {
    selectedPrefix: (text: string) => theme.fg("accent", text),
    selectedText: (text: string) => theme.fg("accent", text),
    description: (text: string) => theme.fg("muted", text),
    scrollInfo: (text: string) => theme.fg("dim", text),
    noMatch: (text: string) => theme.fg("warning", text),
  };
}

/** Case-insensitive substring match on value, label, and description. */
export function applyOverlayFilter(
  items: readonly SelectItem[],
  query: string,
): SelectItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...items];
  return items.filter((item) => {
    const hay = `${item.value}\n${item.label}\n${item.description ?? ""}`;
    return hay.toLowerCase().includes(q);
  });
}

export function isOverlayPrintable(data: string): boolean {
  return data.length === 1 && data >= " " && data <= "~";
}

export function applyOverlayQueryKey(query: string, data: string): string | null {
  if (data === "\x15") return "";
  if (data === "\x7f" || data === "\b" || matchesKey(data, "backspace")) {
    return query.slice(0, -1);
  }
  if (isOverlayPrintable(data)) return query + data;
  return null;
}

export function renderOverlayBox(
  theme: Theme,
  width: number,
  title: string,
  body: readonly string[],
  hint: string,
): string[] {
  const innerWidth = Math.max(1, width - 2);
  const border = (text: string) => theme.fg("dim", text);
  const wrapRow = (text: string): string =>
    `${border("│")}${truncateToWidth(text, innerWidth, "…", true)}${border("│")}`;
  const lines: string[] = [];
  lines.push(border(`╭${"─".repeat(innerWidth)}╮`));
  lines.push(wrapRow(theme.fg("accent", theme.bold(title))));
  lines.push(border(`├${"─".repeat(innerWidth)}┤`));
  for (const line of body) lines.push(wrapRow(line));
  lines.push(border(`├${"─".repeat(innerWidth)}┤`));
  lines.push(wrapRow(theme.fg("dim", hint)));
  lines.push(border(`╰${"─".repeat(innerWidth)}╯`));
  return lines;
}

function listForQuery(
  items: readonly SelectItem[],
  query: string,
  maxVisible: number,
  theme: Theme,
): SelectList {
  const filtered = applyOverlayFilter(items, query);
  const visible =
    filtered.length > 0
      ? filtered
      : [
          {
            label: `geen match voor '${query}'`,
            value: NONE_VALUE,
          },
        ];
  const list = new SelectList(
    visible,
    Math.max(1, Math.min(maxVisible, visible.length)),
    overlaySelectListTheme(theme),
  );
  return list;
}

export async function showSelectOverlay(
  ctx: any,
  title: string,
  hint: string,
  items: SelectItem[],
  maxVisible: number,
): Promise<SelectItem | null> {
  return ctx.ui.custom(
    (
      tui: any,
      theme: Theme,
      _keybindings: any,
      done: (result: SelectItem | null) => void,
    ) => {
      let query = "";
      let selectList = listForQuery(items, query, maxVisible, theme);
      const bind = () => {
        selectList.onSelect = (item) => {
          if (item.value === NONE_VALUE) return;
          done(item);
        };
        selectList.onCancel = () => done(null);
      };
      bind();

      const filterHint = () => {
        const extra = query
          ? `filter '${query}' · ctrl+u clear`
          : "type to filter";
        return `${hint} · ${extra}`;
      };

      return {
        render: (width: number) =>
          renderOverlayBox(
            theme,
            width,
            title,
            selectList.render(Math.max(1, width - 2)),
            filterHint(),
          ),
        invalidate: () => selectList.invalidate(),
        handleInput: (data: string) => {
          const next = applyOverlayQueryKey(query, data);
          if (next !== null) {
            query = next;
            selectList = listForQuery(items, query, maxVisible, theme);
            bind();
            tui.requestRender();
            return;
          }
          selectList.handleInput(data);
          tui.requestRender();
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
