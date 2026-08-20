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
