/**
 * Three-lane Signal renderer.
 *
 * Left: model/repository state. Center: live semantic activity and motion rail.
 * Right: context/queue/usage. Modules retain the existing per-segment fault
 * isolation because every item still renders through `renderSegment`.
 */

import { visibleWidth } from "@earendil-works/pi-tui";
import type {
  PresetDef,
  SegmentContext,
  SignalSpec,
  StatusLineSegmentId,
  StatusLineSeparatorStyle,
} from "../config/types.ts";
import { mergeSegmentsWithCustomItems } from "../config/powerline-config.ts";
import { renderSegment } from "../segments/index.ts";
import { ansi, colorEnabled, getFgAnsiCode } from "../theme/colors.ts";
import { getSeparator } from "../theme/separators.ts";
import { frameAt, getMotion, sweepPosition, trailGlyph } from "../motion/index.ts";
import type { SignalRuntime } from "./controller.ts";
import { getContributedSignalSources } from "../extension/contrib/registry.ts";

export interface SignalRenderOptions {
  separatorStyle: StatusLineSeparatorStyle;
  signal: SignalSpec;
  ascii?: boolean;
  layout?: import("../config/types.ts").StatusLineLayout | null;
  disabledSegments?: StatusLineSegmentId[];
}

interface Module {
  content: string;
  width: number;
}

export function renderSignal(
  ctx: SegmentContext,
  preset: PresetDef,
  runtime: SignalRuntime,
  availableWidth: number,
  options: SignalRenderOptions,
): { topContent: string; secondaryContent: string } {
  const merged = mergeSegmentsWithCustomItems(
    preset,
    ctx.effectiveCustomItems,
    {
      layout: options.layout ?? null,
      disabledSegments: options.disabledSegments ?? [],
    },
  );
  const left = renderModules(merged.leftSegments, ctx);
  const right = [
    ...renderModules(merged.rightSegments, ctx),
    ...renderContributedSources(ctx),
  ];
  const secondary = renderModules(merged.secondarySegments, ctx);
  const separator = getSeparator(options.separatorStyle).left;

  const center = renderActivity(runtime, options.signal, options.ascii);
  const top = fitLanes(left, center, right, separator, availableWidth);
  return {
    topContent: top,
    secondaryContent: joinModules(secondary, separator, availableWidth),
  };
}

function renderModules(ids: readonly StatusLineSegmentId[], ctx: SegmentContext): Module[] {
  const modules: Module[] = [];
  for (const id of ids) {
    // renderSegment is the established per-module error boundary.
    const rendered = renderSegment(id, ctx);
    if (!rendered.visible || !rendered.content) continue;
    modules.push({
      content: rendered.content,
      width: visibleWidth(rendered.content),
    });
  }
  return modules;
}

export function renderActivity(
  runtime: SignalRuntime,
  spec: SignalSpec,
  ascii = false,
): string {
  const def = getMotion(runtime.motionId) ?? getMotion(spec.animation);
  const glyph = def
    ? frameAt(def, runtime.tick, ascii)
    : ascii
      ? "*"
      : "◆";
  const label = runtime.activity || "ready";
  const open = spec.caps.leftOpen ?? "";
  const close = spec.caps.leftClose ?? "";
  const dim = getFgAnsiCode("sep");
  const hot = getFgAnsiCode("accent");
  const reset = colorEnabled() ? ansi.reset : "";
  // ponytail: vivid sweep — 12-char rail with travelling head + 6-char trail, not a single glyph
  const RAIL_WIDTH = 12;
  let railInner: string;
  if (!runtime.active) {
    railInner = "━".repeat(RAIL_WIDTH);
  } else {
    const pos = sweepPosition(runtime.tick, RAIL_WIDTH, true);
    let built = "";
    for (let i = 0; i < RAIL_WIDTH; i++) {
      const dist = Math.abs(i - pos);
      if (dist === 0) built += glyph;
      else if (dist <= 6) built += trailGlyph(dist, ascii);
      else built += "━";
    }
    railInner = built;
  }
  const railColor = runtime.active ? hot : dim;
  const rail = `${spec.separators.left}${railInner}${spec.separators.right}`;
  return `${railColor}${open}${rail}${close}${reset} ${label}`;
}

function fitLanes(
  leftInput: Module[],
  center: string,
  rightInput: Module[],
  separator: string,
  availableWidth: number,
): string {
  if (availableWidth <= 0) return "";
  const left = [...leftInput];
  const right = [...rightInput];
  const sep = styledSeparator(separator);
  const centerWidth = visibleWidth(center);

  const lane = (modules: Module[]) => modules.map((module) => module.content).join(sep);
  const totalWidth = () => {
    const leftText = lane(left);
    const rightText = lane(right);
    return (
      visibleWidth(leftText) +
      visibleWidth(rightText) +
      centerWidth +
      (leftText ? 2 : 0) +
      (rightText ? 2 : 0)
    );
  };

  // Preserve the model/git side first, then context/queue. Remove the least
  // important outer modules until all three lanes fit.
  while (totalWidth() + 2 > availableWidth && right.length > 1) right.shift();
  while (totalWidth() + 2 > availableWidth && left.length > 1) left.pop();
  while (totalWidth() + 2 > availableWidth && right.length > 0) right.shift();
  while (totalWidth() + 2 > availableWidth && left.length > 0) left.pop();

  const leftText = lane(left);
  const rightText = lane(right);
  if (centerWidth + 2 > availableWidth) {
    return ` ${truncatePlain(center, Math.max(0, availableWidth - 2))} `;
  }

  const contentWidth =
    visibleWidth(leftText) +
    visibleWidth(rightText) +
    centerWidth +
    (leftText ? 2 : 0) +
    (rightText ? 2 : 0);
  const flexible = Math.max(0, availableWidth - 2 - contentWidth);
  const before = leftText ? "  " : "";
  const after = rightText ? "  " : "";
  // Extra space lives between center and right, keeping state metrics pinned.
  return ` ${leftText}${before}${center}${after}${" ".repeat(flexible)}${rightText} `;
}

function joinModules(modules: Module[], separator: string, width: number): string {
  if (modules.length === 0) return "";
  const sep = styledSeparator(separator);
  const fitted: Module[] = [];
  let used = 2;
  for (const module of modules) {
    const next = module.width + (fitted.length ? visibleWidth(separator) + 2 : 0);
    if (used + next > width) break;
    fitted.push(module);
    used += next;
  }
  return fitted.length ? ` ${fitted.map((module) => module.content).join(sep)} ` : "";
}

function renderContributedSources(ctx: SegmentContext): Module[] {
  const out: Module[] = [];
  for (const src of getContributedSignalSources()) {
    try {
      const raw = src.render?.(ctx);
      if (!raw || typeof raw !== "string") continue;
      const stripped = raw.replace(/\x1b\[[0-9;]*m/g, "").trim();
      if (!stripped) continue;
      // ponytail: fault-isolated — a throwing or empty source never takes down Signal
      out.push({ content: raw.trim(), width: visibleWidth(raw) });
    } catch {
      // skip failing contribution
    }
  }
  return out;
}

function styledSeparator(separator: string): string {
  const color = getFgAnsiCode("sep");
  const reset = colorEnabled() ? ansi.reset : "";
  return ` ${color}${separator}${reset} `;
}

function truncatePlain(text: string, width: number): string {
  if (width <= 0) return "";
  // Activity labels are ASCII; strip ANSI before this emergency narrow path.
  const plain = text.replace(/\x1b\[[0-9;]*m/g, "");
  return plain.length <= width ? plain : plain.slice(0, Math.max(0, width - 1)) + "…";
}
