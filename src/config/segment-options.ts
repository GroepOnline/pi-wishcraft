import { normalizeCostCurrency } from "../usage/rates.ts";
import { isRecord } from "./primitives.ts";
import type { StatusLineSegmentOptions } from "./types.ts";

export function normalizeSegmentOptions(
  raw: Record<string, unknown>,
): StatusLineSegmentOptions {
  const options: StatusLineSegmentOptions = {};

  if (isRecord(raw.model)) {
    options.model = {
      ...(typeof raw.model.showThinkingLevel === "boolean"
        ? { showThinkingLevel: raw.model.showThinkingLevel }
        : {}),
      ...(raw.model.display === "name" || raw.model.display === "qualified"
        ? { display: raw.model.display }
        : {}),
    };
  }

  if (isRecord(raw.path)) {
    options.path = {
      ...(raw.path.mode === "basename" ||
      raw.path.mode === "abbreviated" ||
      raw.path.mode === "full"
        ? { mode: raw.path.mode }
        : {}),
      ...(typeof raw.path.maxLength === "number" &&
      Number.isFinite(raw.path.maxLength) &&
      raw.path.maxLength > 0
        ? { maxLength: Math.floor(raw.path.maxLength) }
        : {}),
    };
  }

  if (isRecord(raw.git)) {
    options.git = {
      ...(typeof raw.git.showBranch === "boolean"
        ? { showBranch: raw.git.showBranch }
        : {}),
      ...(typeof raw.git.showStaged === "boolean"
        ? { showStaged: raw.git.showStaged }
        : {}),
      ...(typeof raw.git.showUnstaged === "boolean"
        ? { showUnstaged: raw.git.showUnstaged }
        : {}),
      ...(typeof raw.git.showUntracked === "boolean"
        ? { showUntracked: raw.git.showUntracked }
        : {}),
      ...(raw.git.polling === "full" ||
      raw.git.polling === "branch" ||
      raw.git.polling === "off"
        ? { polling: raw.git.polling }
        : {}),
      ...(typeof raw.git.hostIcon === "boolean"
        ? { hostIcon: raw.git.hostIcon }
        : {}),
      ...(typeof raw.git.showAheadBehind === "boolean"
        ? { showAheadBehind: raw.git.showAheadBehind }
        : {}),
      ...(typeof raw.git.showCommit === "boolean"
        ? { showCommit: raw.git.showCommit }
        : {}),
      ...(typeof raw.git.maxCommitSubjectLength === "number" &&
      Number.isFinite(raw.git.maxCommitSubjectLength) &&
      raw.git.maxCommitSubjectLength > 0
        ? { maxCommitSubjectLength: Math.floor(raw.git.maxCommitSubjectLength) }
        : {}),
    };
  }

  if (isRecord(raw.time)) {
    options.time = {
      ...(raw.time.format === "12h" || raw.time.format === "24h"
        ? { format: raw.time.format }
        : {}),
      ...(typeof raw.time.showSeconds === "boolean"
        ? { showSeconds: raw.time.showSeconds }
        : {}),
    };
  }

  if (isRecord(raw.cost)) {
    const currency = normalizeCostCurrency(raw.cost.currency);
    options.cost = {
      ...(raw.cost.subscriptionDisplay === "subscription" ||
      raw.cost.subscriptionDisplay === "reported-cost" ||
      raw.cost.subscriptionDisplay === "both"
        ? { subscriptionDisplay: raw.cost.subscriptionDisplay }
        : {}),
      ...(currency ? { currency } : {}),
    };
  }

  if (isRecord(raw.context)) {
    options.context = {
      ...(raw.context.format === "full" || raw.context.format === "percent"
        ? { format: raw.context.format }
        : {}),
    };
  }

  if (isRecord(raw.cache_read)) {
    options.cache_read = {
      ...(raw.cache_read.format === "tokens" ||
      raw.cache_read.format === "percent" ||
      raw.cache_read.format === "both"
        ? { format: raw.cache_read.format }
        : {}),
    };
  }

  if (isRecord(raw.openPorts)) {
    options.openPorts = {
      ...(typeof raw.openPorts.includeUdp === "boolean"
        ? { includeUdp: raw.openPorts.includeUdp }
        : {}),
    };
  }

  if (isRecord(raw.tps)) {
    options.tps = {
      ...(typeof raw.tps.windowMs === "number" &&
      Number.isFinite(raw.tps.windowMs) &&
      raw.tps.windowMs > 0
        ? { windowMs: raw.tps.windowMs }
        : {}),
      ...(raw.tps.mode === "both" ||
      raw.tps.mode === "out" ||
      raw.tps.mode === "in"
        ? { mode: raw.tps.mode }
        : {}),
      ...(typeof raw.tps.hideIdle === "boolean"
        ? { hideIdle: raw.tps.hideIdle }
        : {}),
    };
  }

  // GR: Generic per-segment template override (segmentOptions.<seg>.template) that
  // applies to any segment id (incl. custom items). Kept alongside the typed fields
  // above; read centrally at render time via the options record.
  const optionsAsRecord = options as unknown as Record<
    string,
    { template?: string }
  >;
  for (const [seg, segRaw] of Object.entries(raw)) {
    if (!isRecord(segRaw)) continue;
    if (typeof segRaw.template !== "string" || !segRaw.template.trim()) continue;
    const holder = isRecord(optionsAsRecord[seg]) ? optionsAsRecord[seg] : {};
    optionsAsRecord[seg] = { ...holder, template: segRaw.template.trim() };
  }

  return options;
}

export function mergeSegmentOptions(
  defaults: StatusLineSegmentOptions = {},
  overrides: StatusLineSegmentOptions = {},
): StatusLineSegmentOptions {
  return {
    ...defaults,
    ...overrides,
    model: { ...defaults.model, ...overrides.model },
    path: { ...defaults.path, ...overrides.path },
    git: { ...defaults.git, ...overrides.git },
    time: { ...defaults.time, ...overrides.time },
    cost: { ...defaults.cost, ...overrides.cost },
    context: { ...defaults.context, ...overrides.context },
    cache_read: { ...defaults.cache_read, ...overrides.cache_read },
    openPorts: { ...defaults.openPorts, ...overrides.openPorts },
    tps: { ...defaults.tps, ...overrides.tps },
  };
}
