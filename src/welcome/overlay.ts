import type { Component } from "@earendil-works/pi-tui";
import { visibleWidth } from "@earendil-works/pi-tui";
import { centerText, getBoxLayout } from "./layout.ts";
import { dim, renderWelcomeBox } from "./renderer.ts";
import { fgOnly } from "../theme/colors.ts";
import type { WelcomeData } from "./types.ts";
import type { LoadedCounts, RecentSession } from "./types.ts";
import { renderWelcomeArtWithReveal, BOOT_REVEAL_MS, revealElapsedForArt } from "./banner.ts";
import { tr } from "../i18n/index.ts";
import type { WelcomeArtTheme } from "./welcome-art.ts";
import { quickLaunchItems } from "./quick-launch.ts";
import type { WelcomeFocus, WelcomeSection } from "./types.ts";

/** Tab order of the cockpit sections. */
const SECTIONS: readonly WelcomeSection[] = ["news", "sessions", "shortcuts"];

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
  private timerPaused = false;
  private selectedWhatsNew: number | null = null;
  private focus: WelcomeFocus = { section: "news", index: 0 };
  /** True once a navigation key has been seen; keeps the default render calm. */
  private focusEngaged = false;

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

  isTimerPaused(): boolean {
    return this.timerPaused;
  }

  /**
   * Step through the `What's new` bullets so truncated entries can be read in
   * full. Interacting pauses the auto-dismiss countdown; only non-printable
   * navigation keys call this, so typing a prompt still just dismisses.
   */
  moveSelection(delta: -1 | 1): void {
    const count = this.data.whatsNew?.length ?? 0;
    if (count === 0) return;
    this.timerPaused = true;
    this.selectedWhatsNew =
      this.selectedWhatsNew === null
        ? delta > 0
          ? 0
          : count - 1
        : (this.selectedWhatsNew + delta + count) % count;
  }

  getSelectedWhatsNew(): number | null {
    return this.selectedWhatsNew;
  }

  /** How many rows a section can highlight (0 = section is skipped). */
  private rowsFor(section: WelcomeSection): number {
    switch (section) {
      case "news":
        return this.data.whatsNew?.length ?? 0;
      case "sessions":
        return Math.min(3, this.data.recentSessions.length);
      case "shortcuts":
        return quickLaunchItems().length;
      default:
        return 0;
    }
  }

  /**
   * Move inside the focused section. The news section keeps its wrapping
   * expanded-bullet behaviour; other sections clamp at the ends.
   */
  moveFocus(delta: -1 | 1): void {
    if (this.focus.section === "news") {
      this.moveSelection(delta);
      if (this.selectedWhatsNew !== null) {
        this.focusEngaged = true;
        this.focus = { section: "news", index: this.selectedWhatsNew };
      }
      return;
    }
    const rows = this.rowsFor(this.focus.section);
    if (rows === 0) return;
    this.timerPaused = true;
    this.focusEngaged = true;
    this.focus = {
      section: this.focus.section,
      index: Math.max(0, Math.min(rows - 1, this.focus.index + delta)),
    };
  }

  /** Tab / Shift+Tab: step to the next non-empty section. */
  cycleSection(delta: -1 | 1): void {
    const start = SECTIONS.indexOf(this.focus.section);
    for (let step = 1; step <= SECTIONS.length; step++) {
      const next = (((start + delta * step) % SECTIONS.length) + SECTIONS.length) % SECTIONS.length;
      const section = SECTIONS[next];
      if (this.rowsFor(section) === 0) continue;
      this.timerPaused = true;
      this.focusEngaged = true;
      this.focus = {
        section,
        index: section === "news" ? (this.selectedWhatsNew ?? 0) : 0,
      };
      return;
    }
  }

  getFocus(): WelcomeFocus | null {
    return this.focusEngaged ? { ...this.focus } : null;
  }

  /**
   * Enter on the focused row. Only meaningful once navigation paused the
   * countdown, and only quick-launch rows carry text for the editor.
   */
  activate(): string | null {
    if (!this.timerPaused || this.focus.section !== "shortcuts") return null;
    const item = quickLaunchItems()[this.focus.index];
    return item?.insert ?? null;
  }

  setArt(art: WelcomeArtTheme, animate: boolean): void {
    this.data.art = art;
    this.data.animateArt = animate;
  }

  /** Arm the OMP-style boot reveal; called when the overlay mounts. */
  armBootReveal(startedAt: number = Date.now()): void {
    this.mountedAt = startedAt;
  }

  /** Swap the panel heading (the first-run flow uses "Getting started"). */
  setWhatsNewTitle(title: string): void {
    this.data.whatsNewTitle = title;
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
    const countdownText = this.timerPaused
      ? ` ${this.pausedHint()} `
      : ` ${tr("welcome.countdown", "Press any key to continue ({n}s)", { n: this.countdown })} `;
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

    const renderData: WelcomeData = {
      ...this.data,
      whatsNewSelected: this.selectedWhatsNew,
      focus: this.getFocus() ?? undefined,
    };
    return renderWelcomeBox(renderData, termWidth, bottomLine, this.revealArt(termWidth));
  }

  /** One hint per section: what the arrows and Enter can do right now. */
  private pausedHint(): string {
    switch (this.focus.section) {
      case "sessions":
        return tr(
          "welcome.pausedHint.sessions",
          "↑/↓ browse crafts · tab switches section · any other key continues",
        );
      case "shortcuts":
        return tr(
          "welcome.pausedHint.shortcuts",
          "↑/↓ choose · enter primes the prompt · tab switches section",
        );
      default:
        return tr("welcome.pausedHint", "↑/↓ browse news · any other key continues");
    }
  }

  /**
   * Left-column art override. Animated lanterns keep their own frame source
   * after the boot window so the flame never freezes on the first paint.
   */
  private revealArt(termWidth: number): string[] | undefined {
    if (this.mountedAt === 0) return undefined;
    const now = Date.now();
    const elapsed = now - this.mountedAt;
    const revealElapsed = revealElapsedForArt(elapsed, this.data.animateArt === true);
    if (revealElapsed === undefined) return undefined;
    const frames = renderWelcomeArtWithReveal(
      this.data.art ?? "lantern",
      termWidth,
      this.data.animateArt === true || revealElapsed < BOOT_REVEAL_MS,
      revealElapsed,
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
