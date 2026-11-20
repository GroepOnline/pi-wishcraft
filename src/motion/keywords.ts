import type { MotionPaintId } from "./paint-catalog.ts";
import { stripMotionAnsi } from "./primitives.ts";
import type { KeywordHit } from "./types.ts";

interface KeywordDef {
  id: string;
  pattern: string;
  paintId: MotionPaintId;
}

const KEYWORDS = [
  { id: "ultrathink", pattern: "ultrathink", paintId: "ultrathink" },
  { id: "think-harder", pattern: "think harder", paintId: "think-harder" },
  { id: "think-hard", pattern: "think hard", paintId: "think-hard" },
  { id: "lanternwake", pattern: "lanternwake", paintId: "lanternwake" },
  { id: "kongming", pattern: "kongming", paintId: "ember-relay" },
  { id: "wishcraft", pattern: "wishcraft", paintId: "wish-rise" },
  { id: "crucible", pattern: "crucible", paintId: "forge-heat" },
  { id: "ultrathink-alias-ultra", pattern: "ultra", paintId: "rainbow-ultra" },
  { id: "xhigh", pattern: "xhigh", paintId: "max-effort" },
  { id: "zenith", pattern: "zenith", paintId: "zenith" },
  { id: "nova", pattern: "nova", paintId: "nova-burst" },
  { id: "aurora", pattern: "aurora", paintId: "aurora-nimbus" },
  { id: "nimbus", pattern: "nimbus", paintId: "aurora-nimbus" },
  { id: "comet", pattern: "comet", paintId: "comet-tail" },
  { id: "storm", pattern: "storm", paintId: "storm-front" },
  { id: "blaze", pattern: "blaze", paintId: "forge-heat" },
  { id: "flare", pattern: "flare", paintId: "rune-flare" },
  { id: "forge", pattern: "forge", paintId: "forge-heat" },
  { id: "warp", pattern: "warp", paintId: "warp-fold" },
  { id: "prism", pattern: "prism", paintId: "prism-split" },
  { id: "helix", pattern: "helix", paintId: "helix-spin" },
  { id: "lantern", pattern: "lantern", paintId: "lanternwake" },
  { id: "ember", pattern: "ember", paintId: "ember-gust" },
  { id: "tide", pattern: "tide", paintId: "tide-rise" },
  { id: "orbit", pattern: "orbit", paintId: "cyan-drift" },
  { id: "spark", pattern: "spark", paintId: "comet-tail" },
  { id: "stitch", pattern: "stitch", paintId: "stitch-travel" },
  { id: "bloom", pattern: "bloom", paintId: "pulse-quiet" },
  { id: "rune", pattern: "rune", paintId: "rune-flare" },
  { id: "wish", pattern: "wish", paintId: "wish-rise" },
  { id: "think", pattern: "think", paintId: "shimmer-work" },
  { id: "max", pattern: "max", paintId: "max-effort" },
  { id: "wisp", pattern: "wisp", paintId: "wisp" },
  { id: "hush", pattern: "hush", paintId: "vigil-hush" },
  { id: "vigil", pattern: "vigil", paintId: "vigil-hush" },
] as const satisfies readonly KeywordDef[];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SORTED = [...KEYWORDS].sort((a, b) => b.pattern.length - a.pattern.length);

const COMPILED: readonly (KeywordDef & { re: RegExp })[] = SORTED.map(
  (def) => ({
    ...def,
    // Unicode-aware word boundary: \b treats letters like é as non-word, so
    // "caféthink" would match "think". Letters, marks, digits and _ count as
    // word characters here.
    re: new RegExp(
      `(?<![\\p{L}\\p{M}\\p{N}_])${escapeRegExp(def.pattern)}(?![\\p{L}\\p{M}\\p{N}_])`,
      "iu",
    ),
  }),
);

export const KEYWORD_COUNT = KEYWORDS.length;

function codePointIndex(text: string, utf16Index: number): number {
  return Array.from(text.slice(0, utf16Index)).length;
}

export function matchKeyword(text: string): KeywordHit | null {
  const plain = stripMotionAnsi(text);
  if (!plain) return null;
  for (const def of COMPILED) {
    const match = def.re.exec(plain);
    if (!match) continue;
    return {
      id: def.id,
      pattern: def.pattern,
      paintId: def.paintId,
      index: codePointIndex(plain, match.index),
      length: [...match[0]].length,
    };
  }
  return null;
}

export function keywordCatalog(): readonly KeywordDef[] {
  return KEYWORDS;
}
