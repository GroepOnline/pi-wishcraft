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
