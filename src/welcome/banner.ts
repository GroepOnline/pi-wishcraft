import type { Component } from "@earendil-works/pi-tui";
import { dim, renderWelcomeBox } from "./renderer.ts";
import type { WelcomeData } from "./types.ts";
import type { LoadedCounts, RecentSession } from "./types.ts";

/**
 * Welcome header - same layout as overlay but persistent (no countdown).
 * Used when quietStartup: true.
 */
export class WelcomeHeader implements Component {
  private data: WelcomeData;

  constructor(
    modelName: string,
    providerName: string,
    recentSessions: RecentSession[] = [],
    loadedCounts: LoadedCounts = {
      contextFiles: 0,
      extensions: 0,
      skills: 0,
      promptTemplates: 0,
    },
    initialContextTokens: number | null = null,
    queueCount?: number,
    hasStash?: boolean,
  ) {
    this.data = {
      modelName,
      providerName,
      recentSessions,
      loadedCounts,
      initialContextTokens,
      queueCount,
      hasStash,
      quietStartup: true,
    };
  }

  invalidate(): void {}

  render(termWidth: number): string[] {
    // Minimum width for two-column layout (must match renderWelcomeBox)
    const minLayoutWidth = 44;
    if (termWidth < minLayoutWidth) {
      return [];
    }

    const minWidth = 76;
    const maxWidth = 96;
    // Clamp to termWidth to prevent crash on narrow terminals
    const boxWidth = Math.min(
      termWidth,
      Math.max(minWidth, Math.min(termWidth - 2, maxWidth)),
    );
    const hChar = "─";

    // Bottom line with column separator (leftCol=26, rightCol=boxWidth-29)
    const leftCol = 26;
    const rightCol = Math.max(1, boxWidth - leftCol - 3);
    const bottomLine =
      dim(hChar.repeat(leftCol)) + dim("┴") + dim(hChar.repeat(rightCol));

    const lines = renderWelcomeBox(this.data, termWidth, bottomLine);
    if (lines.length > 0) {
      lines.push(""); // Add empty line for spacing only if we rendered content
    }
    return lines;
  }
}
