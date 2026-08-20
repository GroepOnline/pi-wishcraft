// index.ts
// Barrel re-exporting the public API for working-vibes
// (AI-generated contextual working messages that match a user's preferred theme/vibe).

export {
  initVibeManager,
  getVibeTheme,
  setVibeTheme,
  getVibeModel,
  setVibeModel,
  onVibeBeforeAgentStart,
  onVibeAgentStart,
  onVibeToolCall,
  onVibeAgentEnd,
  getVibeMode,
  setVibeMode,
  hasVibeFile,
  getVibeFileCount,
} from "./manager.ts";

export type { VibeMode } from "./storage.ts";

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
