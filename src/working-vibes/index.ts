// index.ts
// Barrel re-exporting the public API for working-vibes
// (AI-generated contextual working messages that match a user's preferred theme/vibe).

export {
  initVibeManager,
  getVibeTheme,
  setVibeTheme,
  setVibeWorkingMessageColor,
  getVibeModel,
  setVibeModel,
  onVibeBeforeAgentStart,
  onVibeAgentStart,
  onVibeToolCall,
  onVibeAgentEnd,
  shutdownVibeManager,
  getVibeMode,
  setVibeMode,
  hasVibeFile,
  getVibeFileCount,
} from "./manager.ts";

export type { VibeMode } from "./storage.ts";
export type { WorkingIndicatorStyle } from "./frames.ts";
export {
  allWorkingIndicatorFrames,
  nativeWorkingIndicator,
  workingIndicatorFrame,
  workingIndicatorStyles,
} from "./frames.ts";

export type {
  GenerateVibesResult,
  GenerateVibeSamplesResult,
} from "./generate.ts";
export {
  parseVibeGenerateArgs,
  generateVibesBatch,
  generateVibeSamples,
  parseVibeLines,
} from "./generate.ts";
