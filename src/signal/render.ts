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
import { getMotion } from "../motion/catalog.ts";
import { frameAt } from "../motion/frames.ts";
import { DEFAULT_MOTION_POLICY, type MotionPolicy } from "../motion/types.ts";
import {
  screenReaderStatus,
  shouldAnimateSignal,
  shouldUseColor,
  stableStateMarker,
} from "../motion/accessibility.ts";
import type { SignalRuntime } from "./controller.ts";
import { renderRailSweep, SIGNAL_RAIL_WIDTH } from "./rail.ts";

export interface SignalRenderOptions {
  separatorStyle: StatusLineSeparatorStyle;
  signal: SignalSpec;
  ascii?: boolean;
  layout?: import("../config/types.ts").StatusLineLayout | null;
  disabledSegments?: StatusLineSegmentId[];
  policy?: MotionPolicy;
  color?: boolean;
  railWidth?: number;
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
  const policy = options.policy ?? DEFAULT_MOTION_POLICY;
  if (policy.screenReader) {
    const text = renderSignalScreenReader(ctx, runtime);
    return {
      topContent: truncatePlain(text, Math.max(0, availableWidth)),
      secondaryContent: "",
    };
  }

  const merged = mergeSegmentsWithCustomItems(
    preset,
    ctx.effectiveCustomItems,
    {
      layout: options.layout ?? null,
      disabledSegments: options.disabledSegments ?? [],
    },
  );
  const separator = getSeparator(options.separatorStyle).left;
  const useColor = options.color ?? shouldUseColor(policy, colorEnabled());
  const left = renderModules(merged.leftSegments, ctx, useColor);
  const right = renderModules(merged.rightSegments, ctx, useColor);
  const secondary = renderModules(merged.secondarySegments, ctx, useColor);

  const center = renderActivity(runtime, options.signal, options.ascii, policy, {
    color: useColor,
    railWidth: options.railWidth,
  });
  const top = fitLanes(left, center, right, separator, availableWidth, useColor);
  return {
    topContent: top,
    secondaryContent: joinModules(secondary, separator, availableWidth, useColor),
  };
}

export function renderSignalScreenReader(
  ctx: SegmentContext,
  runtime: SignalRuntime,
): string {
  const model = ctx.model?.name ?? ctx.model?.id ?? "unknown";
  const dirty =
    (ctx.git.staged ?? 0) + (ctx.git.unstaged ?? 0) + (ctx.git.untracked ?? 0) > 0;
  const git = ctx.git.branch
    ? `${ctx.git.branch}${dirty ? " (dirty)" : " (clean)"}`
    : "none";
  return screenReaderStatus({
    model,
    git,
    event: runtime.event,
    activity: runtime.activity,
    contextPercent: Math.round(ctx.contextPercent ?? 0),
  });
}

function renderModules(
  ids: readonly StatusLineSegmentId[],
  ctx: SegmentContext,
  useColor: boolean,
): Module[] {
  const modules: Module[] = [];
  for (const id of ids) {
    const rendered = renderSegment(id, ctx);
    if (!rendered.visible || !rendered.content) continue;
    const content = useColor
      ? rendered.content
      : rendered.content.replace(/\x1b\[[0-9;]*m/g, "");
    modules.push({
      content,
      width: visibleWidth(content),
    });
  }
  return modules;
}

export function renderActivity(
  runtime: SignalRuntime,
  spec: SignalSpec,
  ascii = false,
  policy: MotionPolicy = DEFAULT_MOTION_POLICY,
  options: { color?: boolean; railWidth?: number } = {},
): string {
  const useColor = options.color ?? shouldUseColor(policy, colorEnabled());
  const useAscii = ascii || policy.lowColor;
  const def = getMotion(runtime.motionId) ?? getMotion(spec.animation);
  const glyph = def
    ? frameAt(def, runtime.tick, useAscii)
    : useAscii
      ? "*"
      : "◆";
  const label = runtime.activity || "ready";
  const open = spec.caps.leftOpen ?? "";
  const close = spec.caps.leftClose ?? "";
  const dim = useColor ? getFgAnsiCode("sep") : "";
  const reset = useColor ? ansi.reset : "";
  const animating = runtime.active && shouldAnimateSignal(runtime.event, policy);
  const railWidth = options.railWidth ?? SIGNAL_RAIL_WIDTH;
  const rail = renderRailSweep({
    tick: runtime.tick,
    width: railWidth,
    animating,
    ascii: useAscii,
    trail: def?.generator?.trail ?? 3,
    direction: def?.generator?.direction ?? "forward",
  });
  const marker =
    !animating && policy.level !== "full"
      ? ` ${stableStateMarker(runtime.event, useAscii)}`
      : "";
  return `${dim}${open}${rail}${close}${reset} ${glyph}${marker} ${label}`;
}

function fitLanes(
  leftInput: Module[],
  center: string,
  rightInput: Module[],
  separator: string,
  availableWidth: number,
  useColor: boolean,
): string {
  if (availableWidth <= 0) return "";
  const left = [...leftInput];
  const right = [...rightInput];
  const sep = styledSeparator(separator, useColor);
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
  return ` ${leftText}${before}${center}${after}${" ".repeat(flexible)}${rightText} `;
}

function joinModules(
  modules: Module[],
  separator: string,
  width: number,
  useColor: boolean,
): string {
  if (modules.length === 0) return "";
  const sep = styledSeparator(separator, useColor);
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

function styledSeparator(separator: string, useColor: boolean): string {
  const color = useColor ? getFgAnsiCode("sep") : "";
  const reset = useColor ? ansi.reset : "";
  return ` ${color}${separator}${reset} `;
}

function truncatePlain(text: string, width: number): string {
  if (width <= 0) return "";
  const plain = text.replace(/\x1b\[[0-9;]*m/g, "");
  return plain.length <= width ? plain : plain.slice(0, Math.max(0, width - 1)) + "…";
}
