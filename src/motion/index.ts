/**
 * index.ts
 * ---------------------------------------------------------------------------
 * Public surface of the motion engine. One scheduler, semantic events, data
 * driven motion definitions, and an accessibility policy.
 * ---------------------------------------------------------------------------
 */

export type {
  MotionChannel,
  MotionColorRole,
  MotionDef,
  MotionEvent,
  MotionGenerator,
  MotionGeometry,
  MotionLevel,
  MotionLoop,
  MotionPolicy,
  MotionToggles,
} from "./types.ts";
export { DEFAULT_MOTION_POLICY } from "./types.ts";

export {
  CADENCE_MS,
  CHANNEL_MATRIX,
  MOTION_CATALOG,
  PREVIEW_INTERVAL_MS,
  channelsForEvent,
  defaultMotionFor,
  eventUsesChannel,
  getMotion,
  isContinuous,
} from "./catalog.ts";

export {
  allowedChannels,
  allowsColorTransition,
  cadenceFor,
  describeMotionEvent,
  effectiveLevel,
  prefersAsciiGlyphs,
  targetFps,
} from "./policy.ts";

export {
  frameAt,
  frameAtElapsed,
  framesOf,
  lanternGlow,
  sweepPosition,
  trailGlyph,
} from "./frames.ts";

export { MotionScheduler } from "./scheduler.ts";
export type { MotionConsumer, MotionSchedulerOptions } from "./scheduler.ts";

export {
  detectNoColor,
  detectTerminalCapabilities,
} from "../theme/detect.ts";
export type { TerminalCapabilities } from "../theme/detect.ts";

export {
  cycleMotionLevel,
  describeMotionLevel,
  effectiveFps,
  isMotionLevel,
  motionPolicyFromEnvironment,
  parseMotionSettings,
  screenReaderStatus,
  shouldAnimateSignal,
  shouldUseAscii,
  shouldUseColor,
  stableStateMarker,
} from "./accessibility.ts";

export {
  GALLERY_GROUPS,
  groupMotions,
  motionsInGroup,
  previewMotionFrames,
  previewMotionRail,
  searchMotions,
  toggleFavorite,
} from "./gallery.ts";
export type { GalleryGroup } from "./gallery.ts";

export {
  composerTimeline,
  composerToMotion,
  cycleEase,
  cycleGeometry,
  draftFromId,
  draftFromMotion,
  patchComposerDraft,
  previewComposerFrames,
  toggleComposerChannel,
} from "./composer.ts";
export type { ComposerDraft } from "./composer.ts";
