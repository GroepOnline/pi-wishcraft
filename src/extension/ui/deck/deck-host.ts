/**
 * src/extension/ui/deck/deck-host.ts
 * ---------------------------------------------------------------------------
 * The Wishcraft Deck Overlay Host (Single Continuous Outer Frame via ctx.ui.custom).
 * ---------------------------------------------------------------------------
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { RuntimeState } from "../../core/types.ts";
import type { DeckContext, DeckRoute, DeckRouteDef } from "./types.ts";
import { renderHomeRoute } from "./routes/home.ts";
import { renderAppearanceRoute } from "./routes/appearance.ts";
export const DECK_ROUTES: DeckRouteDef[] = [
  { id: "home", label: "Home", glyph: "◉", shortcut: "g h", description: "Session overview and next intent" },
  { id: "signal", label: "Signal", glyph: "◆", shortcut: "g p", description: "Animated 3-lane powerline" },
  { id: "skills", label: "Skills", glyph: "◇", shortcut: "g s", description: "Skill catalog and health" },
  { id: "ideas", label: "Ideas", glyph: "◇", shortcut: "g i", description: "Captured thoughts and queue" },
  { id: "guardrails", label: "Guardrails", glyph: "◇", shortcut: "g g", description: "Safety policy enforcement" },
  { id: "shell", label: "Shell", glyph: "◇", shortcut: "g b", description: "Bash environment and tools" },
  { id: "usage", label: "Usage", glyph: "◇", shortcut: "g u", description: "Token ledger and cost analysis" },
  { id: "appearance", label: "Appearance", glyph: "◇", shortcut: "g a", description: "10 presets and design tokens" },
  { id: "motion", label: "Motion", glyph: "◇", shortcut: "g m", description: "Motion Gallery and Composer" },
  { id: "shortcuts", label: "Shortcuts", glyph: "◇", shortcut: "g ?", description: "Keyboard reference" },
  { id: "diagnostics", label: "Diagnostics", glyph: "◇", shortcut: "g d", description: "Terminal health checks" },
];

export async function openWishcraftDeck(
  rt: RuntimeState,
  ctx: any,
  initialRoute: DeckRoute = "home",
): Promise<void> {
  if (!ctx?.hasUI) return;

  const deckCtx: DeckContext = {
    activeRoute: initialRoute,
    searchQuery: "",
    isSearching: false,
    activeMotionGlyph: "✦",
    sessionState: {
      model: rt.currentCtx?.model?.id ?? "GPT-5.6",
      branch: "main",
      contextPct: 47,
      activityStatus: rt.isStreaming ? "Streaming" : "Ready / Idle",
    },
  };

  await ctx.ui.custom((_tui: any, theme: Theme, keyboard: any, done: () => void) => {
    const handleInput = (data: string) => {
      if (matchesKey(data, "escape")) {
        done();
        return;
      }

      // Search toggle
      if (data === "/" && !deckCtx.isSearching) {
        deckCtx.isSearching = true;
        deckCtx.searchQuery = "";
        return;
      }

      if (deckCtx.isSearching) {
        if (matchesKey(data, "return") || matchesKey(data, "escape")) {
          deckCtx.isSearching = false;
          return;
        }
        if (data === "\x7f" || data === "\b" || matchesKey(data, "backspace")) {
          deckCtx.searchQuery = deckCtx.searchQuery.slice(0, -1);
          return;
        }
        if (data.length === 1 && data >= " " && data <= "~") {
          deckCtx.searchQuery += data;
          // Jump to matching route
          const matched = DECK_ROUTES.find((r) =>
            r.id.toLowerCase().includes(deckCtx.searchQuery.toLowerCase()) ||
            r.label.toLowerCase().includes(deckCtx.searchQuery.toLowerCase())
          );
          if (matched) deckCtx.activeRoute = matched.id;
          return;
        }
      }

      // Navigation shortcuts
      if (data === "1" || data === "h") deckCtx.activeRoute = "home";
      if (data === "2" || data === "p") deckCtx.activeRoute = "signal";
      if (data === "3" || data === "s") deckCtx.activeRoute = "skills";
      if (data === "4" || data === "i") deckCtx.activeRoute = "ideas";
      if (data === "5" || data === "g") deckCtx.activeRoute = "guardrails";
      if (data === "6" || data === "u") deckCtx.activeRoute = "usage";
      if (data === "7" || data === "a") deckCtx.activeRoute = "appearance";
      if (data === "8" || data === "m") deckCtx.activeRoute = "motion";
      if (data === "9" || data === "?") deckCtx.activeRoute = "shortcuts";

      if (matchesKey(data, "tab")) {
        const idx = DECK_ROUTES.findIndex((r) => r.id === deckCtx.activeRoute);
        const nextIdx = (idx + 1) % DECK_ROUTES.length;
        deckCtx.activeRoute = DECK_ROUTES[nextIdx]!.id;
      }
    };

    const render = (width: number): string[] => {
      const innerWidth = Math.max(1, width - 2);
      const border = (t: string) => theme.fg("dim", t);
      const accent = (t: string) => theme.fg("accent", t);
      const text = (t: string) => theme.fg("text", t);
      const dim = (t: string) => theme.fg("dim", t);

      const wrapRow = (rowContent: string): string =>
        `${border("│")}${truncateToWidth(rowContent, innerWidth, "…", true)}${border("│")}`;

      const lines: string[] = [];

      // 1. Continuous Outer Header
      lines.push(border(`╭${"─".repeat(innerWidth)}╮`));
      const headerTitle = ` ◈ WISHCRAFT OPERATOR DECK  ${dim(`[${deckCtx.activeRoute.toUpperCase()}]`)}    ${accent(deckCtx.activeMotionGlyph)} `;
      lines.push(wrapRow(theme.bold(headerTitle)));
      lines.push(border(`├${"─".repeat(innerWidth)}┤`));

      // 2. Active Route Body
      let bodyLines: string[] = [];
      if (deckCtx.activeRoute === "home") {
        bodyLines = renderHomeRoute(theme, deckCtx, width);
      } else if (deckCtx.activeRoute === "appearance") {
        bodyLines = renderAppearanceRoute(theme, deckCtx, width);
      } else {
        bodyLines = [
          `  ${theme.bold(text(deckCtx.activeRoute.toUpperCase()))} - ${dim("Interactive route surface active")}`,
          `  ${dim("Use [Tab] to cycle routes, [/] to search, [Esc] to exit.")}`,
        ];
      }

      for (const bLine of bodyLines) {
        lines.push(wrapRow(bLine));
      }

      // Fill vertical space
      while (lines.length < 16) {
        lines.push(wrapRow(""));
      }

      // 3. Footer Key Hints
      lines.push(border(`├${"─".repeat(innerWidth)}┤`));
      const searchHint = deckCtx.isSearching
        ? `SEARCH: ${theme.bold(accent(deckCtx.searchQuery))}█`
        : `/ search    Tab next route    g s skills    g i ideas    Esc close`;
      lines.push(wrapRow(dim(searchHint)));
      lines.push(border(`╰${"─".repeat(innerWidth)}╯`));

      return lines;
    };

    return {
      render,
      handleInput,
      dispose() {},
    };
  });
}
