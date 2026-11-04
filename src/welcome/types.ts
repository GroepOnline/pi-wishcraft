import type { WelcomeArtTheme } from "./welcome-art.ts";

export interface LoadedCounts {
  contextFiles: number;
  extensions: number;
  skills: number;
  promptTemplates: number;
}

export interface RecentSession {
  name: string;
  timeAgo: string;
}

/** Sections the welcome overlay lets the operator step through with Tab. */
export type WelcomeSection = "news" | "sessions" | "shortcuts";

export interface WelcomeFocus {
  section: WelcomeSection;
  /** Row index within that section. */
  index: number;
}

export interface WelcomeData {
  modelName: string;
  providerName: string;
  recentSessions: RecentSession[];
  loadedCounts: LoadedCounts;
  initialContextTokens: number | null;
  queueCount?: number;
  hasStash?: boolean;
  nextIdeaText?: string;
  whatsNew?: string[];
  /** Index of the `whatsNew` bullet shown expanded (wrapped, not truncated). */
  whatsNewSelected?: number | null;
  /** Which section Tab is on and which row inside it is highlighted. */
  focus?: WelcomeFocus;
  /**
   * Heading above `whatsNew`. Defaults to "What's new"; the first-run flow
   * swaps it for a short "Getting started" so a brand-new operator sees three
   * next steps instead of a changelog wall.
   */
  whatsNewTitle?: string;
  /** Left-column art theme (lantern / balloon / normal). */
  art?: WelcomeArtTheme;
  /** Animate the lantern flame. */
  animateArt?: boolean;
}

export interface WelcomeWidget {
  id: string;
  render(ctx: WidgetRenderContext): string[];
}

export interface WidgetRenderContext {
  data: WelcomeData;
  width: number;
  dim: (text: string) => string;
  bold: (text: string) => string;
  color: (semantic: string, text: string) => string;
}

export interface WelcomeLayoutConfig {
  width: number;
  padding: number;
  columnGap: number;
  breakpoint: number;
}
