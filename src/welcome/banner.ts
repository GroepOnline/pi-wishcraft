import type { Component } from "@earendil-works/pi-tui";
import { ansi, emberFlicker, fgOnly } from "../theme/colors.ts";
import { centerText, getBoxLayout } from "./layout.ts";
import { dim } from "./renderer.ts";
import { renderWelcomeBox } from "./renderer.ts";
import type { LoadedCounts, RecentSession, WelcomeData } from "./types.ts";
import { DEFAULT_WELCOME_ART, renderWelcomeArt, type WelcomeArtTheme } from "./welcome-art.ts";

/**
 * Boot reveal, borrowed from the OMP intro idea: for the first ~1.5s after
 * mount the header art ramps from a faint ember to full brightness, then
 * settles into the steady layout. Pure in (elapsedMs, now) so tests can pin
 * frames; the interval that drives it is owned by the welcome integration.
 */

/** Length of the reveal window, exported for tests and callers. */
export const BOOT_REVEAL_MS = 1500;

/** Heartbeat the boot reveal repaints on — inside the ambient cadence band. */
export const BOOT_REVEAL_HEARTBEAT_MS = 90;

/**
 * Render the welcome art with a boot reveal ramp. `elapsedMs` is time since
 * the header mounted: 0 disables the reveal (steady state), anything inside
 * the reveal window fades the art up from a faint ember to full brightness.
 * Flicker rides the same value-noise curve as the signal rail, so the intro
 * and the status bar feel like one motion engine.
 */
export function renderWelcomeArtWithReveal(
  theme: WelcomeArtTheme,
  width: number,
  animate: boolean,
  elapsedMs: number,
  now: number,
): string[] {
  const art = renderWelcomeArt(theme, width, {
    now,
    animate: animate || (elapsedMs > 0 && elapsedMs < BOOT_REVEAL_MS),
  });
  if (elapsedMs <= 0 || elapsedMs >= BOOT_REVEAL_MS) return art;
  const progress = Math.min(1, elapsedMs / BOOT_REVEAL_MS);
  // Logarithmic fade-in: the first frames read clearly, then settle gently.
  const ramp = Math.log2(1 + 31 * progress) / 5;
  const dimFactor = 0.22 + 0.78 * Math.min(1, ramp);
  return art.map((line) => dimAnsiLine(line, dimFactor, now));
}

/** Scale all truecolor SGR fg codes in a line toward black by `dimFactor`. */
function dimAnsiLine(line: string, dimFactor: number, now: number): string {
  // Subtle ember flicker while revealing, exactly like a lantern catching.
  const flicker = 0.97 + 0.03 * emberFlicker(11, now);
  const factor = Math.max(0, Math.min(1, dimFactor * flicker));
  return line.replace(
    /\x1b\[38;2;(\d+);(\d+);(\d+)m/g,
    (_match, r: string, g: string, b: string) =>
      ansi.getFgAnsi(
        Math.round(Number(r) * factor),
        Math.round(Number(g) * factor),
        Math.round(Number(b) * factor),
      ),
  );
}

/**
 * True while a header mounted at `startedAt` is still inside its reveal
 * window. The welcome integration uses this to schedule the repaints and
 * to stop them — a bounded one-shot ramp, zero timers once it settles.
 */
export function bootRevealActive(startedAt: number, now: number): boolean {
  return now - startedAt < BOOT_REVEAL_MS;
}

/**
 * Welcome header - same layout as overlay but persistent (no countdown).
 * Used when quietStartup: true. The first ~1.5s after mount fades the art
 * up from a faint ember (OMP-style boot reveal), then renders steady.
 */
export class WelcomeHeader implements Component {
  private data: WelcomeData;
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

  setArt(art: WelcomeArtTheme, animate: boolean): void {
    this.data.art = art;
    this.data.animateArt = animate;
  }

  /** Arm the boot reveal; the welcome integration calls this at mount. */
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
    const hChar = "─";

    // Bottom line with column separator (leftCol=26, rightCol=boxWidth-29)
    const leftCol = 26;
    const rightCol = Math.max(1, boxWidth - leftCol - 3);
    const bottomLine =
      dim(hChar.repeat(leftCol)) + dim("┴") + dim(hChar.repeat(rightCol));

    const lines = renderWelcomeBox(this.data, termWidth, bottomLine, this.revealArt(termWidth));
    if (lines.length > 0) {
      lines.push(""); // Add empty line for spacing only if we rendered content
    }
    return lines;
  }

  /**
   * Reveal frames for the left column while the boot window is open. The
   * column height matches getBoxLayout's leftCol so the swap keeps the
   * box exactly as tall as the steady render.
   */
  private revealArt(termWidth: number): string[] | undefined {
    if (this.mountedAt === 0) return undefined;
    const now = Date.now();
    const elapsed = now - this.mountedAt;
    if (elapsed >= BOOT_REVEAL_MS) return undefined;
    const theme: WelcomeArtTheme = this.data.art ?? DEFAULT_WELCOME_ART;
    const frames = renderWelcomeArtWithReveal(
      theme,
      termWidth,
      this.data.animateArt === true,
      elapsed,
      now,
    );
    const boxLayout = getBoxLayout(termWidth);
    if (!boxLayout) return undefined;
    const identity = [
      "",
      centerText(fgOnly("model", this.data.modelName), boxLayout.leftCol),
      centerText(dim(this.data.providerName), boxLayout.leftCol),
    ];
    return [...frames, ...identity];
  }
}
