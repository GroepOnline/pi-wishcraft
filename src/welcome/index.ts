export type { LoadedCounts, RecentSession, WelcomeData, WelcomeWidget } from "./types.ts";
export { WelcomeComponent } from "./overlay.ts";
export { WelcomeHeader } from "./banner.ts";
export { discoverLoadedCounts } from "./discover.ts";
export { getRecentSessions } from "./sessions.ts";
export { WhatsNewWidget } from "./widgets/whats-new-widget.ts";
export { discoverWhatsNew, parseChangelogDelta } from "./whats-new.ts";
export {
  DEFAULT_WELCOME_ART,
  WELCOME_ART_THEMES,
  normalizeWelcomeArt,
  renderWelcomeArt,
  type WelcomeArtTheme,
} from "./welcome-art.ts";
