import type { Component } from "@earendil-works/pi-tui";
import { visibleWidth } from "@earendil-works/pi-tui";
import { centerText, getBoxLayout } from "./layout.ts";
import { dim, renderWelcomeBox } from "./renderer.ts";
import { fgOnly } from "../theme/colors.ts";
import type { WelcomeData } from "./types.ts";
import type { LoadedCounts, RecentSession } from "./types.ts";
import { renderWelcomeArtWithReveal, BOOT_REVEAL_MS } from "./banner.ts";
import type { WelcomeArtTheme } from "./welcome-art.ts";

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
  private mountedAt = 0;

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

  setArt(art: WelcomeArtTheme, animate: boolean): void {
    this.data.art = art;
    this.data.animateArt = animate;
  }

  /** Arm the OMP-style boot reveal; called when the overlay mounts. */
  armBootReveal(startedAt: number = Date.now()): void {
    this.mountedAt = startedAt;
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

    return renderWelcomeBox(this.data, termWidth, bottomLine, this.revealArt(termWidth));
  }

  /** Left-column reveal frames while the boot window is open. */
  private revealArt(termWidth: number): string[] | undefined {
    if (this.mountedAt === 0) return undefined;
    const now = Date.now();
    const elapsed = now - this.mountedAt;
    if (elapsed >= BOOT_REVEAL_MS) return undefined;
    const frames = renderWelcomeArtWithReveal(
      this.data.art ?? "lantern",
      termWidth,
      this.data.animateArt === true,
      elapsed,
      now,
    );
    const boxLayout = getBoxLayout(termWidth);
    if (!boxLayout) return undefined;
    return [
      ...frames,
      "",
      centerText(fgOnly("model", this.data.modelName), boxLayout.leftCol),
      centerText(dim(this.data.providerName), boxLayout.leftCol),
    ];
  }
}
