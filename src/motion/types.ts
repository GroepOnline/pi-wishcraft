/**
 * types.ts
 * ---------------------------------------------------------------------------
 * Semantic motion vocabulary for Wishcraft vNext. Events describe what the
 * agent is doing; channels describe where that shows up. An event never has to
 * use every channel.
 * ---------------------------------------------------------------------------
 */

export type MotionEvent =
  | "idle"
  | "thinking"
  | "streaming"
  | "tool.start"
  | "tool.end"
  | "idea.capture"
  | "skill.insert"
  | "policy.deny"
  | "repair"
  | "compact"
  | "success"
  | "warning"
  | "error";

export type MotionChannel =
  | "workingGlyph"
  | "signal"
  | "deckTransient"
  | "panelIndicator"
  | "borderEmphasis"
  | "ambient";

export type MotionLevel = "full" | "reduced" | "functional" | "off";

export type MotionLoop = "while-active" | "finite" | "ambient";

export type MotionGeometry =
  | "linear"
  | "orbit"
  | "wave"
  | "bloom"
  | "liquid"
  | "ember"
  | "stitch"
  | "refract"
  | "heat"
  | "write"
  | "path";

/**
 * Token role a motion paints with. Kept as a string union rather than a
 * concrete palette so the motion engine has no dependency on the theme layer.
 */
export type MotionColorRole =
  | "text"
  | "textMuted"
  | "primary"
  | "secondary"
  | "accent"
  | "success"
  | "warning"
  | "error"
  | "motionDim"
  | "motionHot"
  | "motionTrail";

export interface MotionGenerator {
  geometry: MotionGeometry;
  radius?: number;
  trail?: number;
  direction?: "forward" | "reverse";
  clockwise?: boolean;
  intervalMs: number;
  ease: "linear" | "pulse" | "breathe";
}

export interface MotionDef {
  id: string;
  name: string;
  category: "wishcraft" | "matrix" | "procedural" | "classic" | "custom";
  kind: "frames" | "generator";
  /** Channels this motion is allowed to drive. */
  channels: MotionChannel[];
  colorRole: MotionColorRole;
  /** Used when Nerd fonts are unavailable or glyphs are forced to ASCII. */
  fallbackGlyph: string;
  loop: MotionLoop;
  frames?: string[];
  generator?: MotionGenerator;
  description: string;
}

export interface MotionToggles {
  /** Decorative ambient motion while nothing is happening. */
  ambient: boolean;
  /** State animations: working glyph and panel indicators. */
  state: boolean;
  /** Deck transitions and transient toasts. */
  transitions: boolean;
  /** The animated Signal sweep. */
  signal: boolean;
  /** Cursor effects. Off by default. */
  cursor: boolean;
}

export interface MotionPolicy {
  level: MotionLevel;
  toggles: MotionToggles;
  /** NO_COLOR is set: glyph motion may stay, color transitions must not. */
  noColor: boolean;
  /** Terminal cannot do truecolor; degrade gracefully. */
  lowColor: boolean;
  /** Screen-reader mode: motion off, status as stable text. */
  screenReader: boolean;
  /** Host reports a reduced-motion preference. */
  reducedMotion: boolean;
}

export const DEFAULT_MOTION_POLICY: MotionPolicy = {
  level: "full",
  toggles: {
    ambient: true,
    state: true,
    transitions: true,
    signal: true,
    cursor: false,
  },
  noColor: false,
  lowColor: false,
  screenReader: false,
  reducedMotion: false,
};


/* ---------------------------------------------------------------------------
 * Powerline paint: color-only keyword/catalog overlays on the composed status
 * line. Distinct from rail motions — paint recolors already-laid-out text at
 * render time, so visible width never changes.
 * ------------------------------------------------------------------------- */

export type MotionStyleId =
  | "shimmer" | "rainbow" | "ember" | "heat" | "aurora"
  | "comet" | "prism" | "tide" | "pulse";

export type MotionIntensity = 1 | 2 | 3 | 4 | 5;

export interface MotionSettings {
  enabled: boolean;
  keywords: boolean;
}

export interface KeywordHit {
  id: string;
  pattern: string;
  paintId: string;
  /** Unicode code-point index into the stripped visible text. */
  index: number;
  /** Unicode code-point length of the matched span. */
  length: number;
}

export type MotionPaint =
  | { kind: "none" }
  | {
      kind: "keyword";
      style: MotionStyleId;
      intensity: MotionIntensity;
      speed: number;
      paintId: string;
      keyword: KeywordHit;
      burst: boolean;
    }
  | {
      kind: "catalog";
      style: MotionStyleId;
      intensity: MotionIntensity;
      speed: number;
      paintId: string;
    };

/**
 * Lease-based paint runtime. Owns no timer: it subscribes a consumer on the
 * shared MotionScheduler while paint is needed and releases it at idle.
 */
export interface PowerlinePaint {
  noteText(text: string): void;
  setSettings(settings: MotionSettings): void;
  getSettings(): MotionSettings;
  getPaint(now?: number): MotionPaint;
  /** Re-evaluate whether the clock lease is needed (streaming flips, policy). */
  sync(): void;
  reset(): void;
}

export const PAINT_TICK_MS = 50;
export const KEYWORD_BURST_MS = 1600;
export const KEYWORD_BURST_SPEED = 1.45;
