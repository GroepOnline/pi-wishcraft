import type { Component } from "@earendil-works/pi-tui";
import { visibleWidth } from "@earendil-works/pi-tui";
import { dim, renderWelcomeBox } from "./renderer.ts";
import type { WelcomeData } from "./types.ts";
import type { LoadedCounts, RecentSession } from "./types.ts";

// ═══════════════════════════════════════════════════════════════════════════
// Welcome Components
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Welcome overlay component for pi agent.
 * Displays a branded splash screen with logo, tips, and loaded counts.
 */
export class WelcomeComponent implements Component {
  private data: WelcomeData;
  private countdown: number = 30;

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
    whatsNew?: string[],
    nextIdeaText?: string,
  ) {
    this.data = {
      modelName,
      providerName,
      recentSessions,
      loadedCounts,
      initialContextTokens,
      queueCount,
      hasStash,
      whatsNew,
      nextIdeaText,
    };
  }

  setCountdown(seconds: number): void {
    this.countdown = seconds;
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

    // Bottom line with countdown
    const countdownText = ` Press any key to continue (${this.countdown}s) `;
    const countdownStyled = dim(countdownText);
    const bottomContentWidth = boxWidth - 2;
    const countdownVisLen = visibleWidth(countdownText);
    const leftPad = Math.floor((bottomContentWidth - countdownVisLen) / 2);
    const rightPad = bottomContentWidth - countdownVisLen - leftPad;
    const hChar = "─";
    const bottomLine =
      dim(hChar.repeat(Math.max(0, leftPad))) +
      countdownStyled +
      dim(hChar.repeat(Math.max(0, rightPad)));

    return renderWelcomeBox(this.data, termWidth, bottomLine);
  }
}
