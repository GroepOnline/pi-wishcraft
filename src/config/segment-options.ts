import { normalizeCostCurrency } from "../usage/rates.ts";
import { isRecord } from "./primitives.ts";
import type { StatusLineSegmentOptions } from "./types.ts";

/**
 * Normalizes raw segment configuration into supported status-line segment options.
 *
 * Invalid values are ignored, numeric limits are normalized, string values are trimmed,
 * and non-empty template overrides are preserved for supported option groups.
 *
 * @param raw - Raw segment configuration to normalize
 * @returns The validated and normalized segment options
 */
export function normalizeSegmentOptions(
  raw: Record<string, unknown>,
): StatusLineSegmentOptions {
  const options: StatusLineSegmentOptions = {};

  if (isRecord(raw.model)) {
    const model: NonNullable<StatusLineSegmentOptions["model"]> = {};
    if (typeof raw.model.showThinkingLevel === "boolean") {
      model.showThinkingLevel = raw.model.showThinkingLevel;
    }
    if (raw.model.display === "name" || raw.model.display === "qualified") {
      model.display = raw.model.display;
    }
    options.model = model;
  }

  if (isRecord(raw.path)) {
    const path: NonNullable<StatusLineSegmentOptions["path"]> = {};
    if (
      raw.path.mode === "basename" ||
      raw.path.mode === "abbreviated" ||
      raw.path.mode === "full"
    ) {
      path.mode = raw.path.mode;
    }
    if (
      typeof raw.path.maxLength === "number" &&
      Number.isFinite(raw.path.maxLength) &&
      raw.path.maxLength > 0
    ) {
      path.maxLength = Math.floor(raw.path.maxLength);
    }
    options.path = path;
  }

  if (isRecord(raw.git)) {
    const git: NonNullable<StatusLineSegmentOptions["git"]> = {};
    if (typeof raw.git.showBranch === "boolean") git.showBranch = raw.git.showBranch;
    if (typeof raw.git.showStaged === "boolean") git.showStaged = raw.git.showStaged;
    if (typeof raw.git.showUnstaged === "boolean") {
      git.showUnstaged = raw.git.showUnstaged;
    }
    if (typeof raw.git.showUntracked === "boolean") {
      git.showUntracked = raw.git.showUntracked;
    }
    if (
      raw.git.polling === "full" ||
      raw.git.polling === "branch" ||
      raw.git.polling === "off"
    ) {
      git.polling = raw.git.polling;
    }
    if (typeof raw.git.hostIcon === "boolean") git.hostIcon = raw.git.hostIcon;
    if (typeof raw.git.showAheadBehind === "boolean") {
      git.showAheadBehind = raw.git.showAheadBehind;
    }
    if (typeof raw.git.showCommit === "boolean") git.showCommit = raw.git.showCommit;
    if (
      typeof raw.git.maxCommitSubjectLength === "number" &&
      Number.isFinite(raw.git.maxCommitSubjectLength) &&
      raw.git.maxCommitSubjectLength > 0
    ) {
      git.maxCommitSubjectLength = Math.floor(raw.git.maxCommitSubjectLength);
    }
    options.git = git;
  }

  if (isRecord(raw.time)) {
    const time: NonNullable<StatusLineSegmentOptions["time"]> = {};
    if (raw.time.format === "12h" || raw.time.format === "24h") {
      time.format = raw.time.format;
    }
    if (typeof raw.time.showSeconds === "boolean") {
      time.showSeconds = raw.time.showSeconds;
    }
    options.time = time;
  }

  if (isRecord(raw.cost)) {
    const currency = normalizeCostCurrency(raw.cost.currency);
    const cost: NonNullable<StatusLineSegmentOptions["cost"]> = {};
    if (
      raw.cost.subscriptionDisplay === "subscription" ||
      raw.cost.subscriptionDisplay === "reported-cost" ||
      raw.cost.subscriptionDisplay === "both"
    ) {
      cost.subscriptionDisplay = raw.cost.subscriptionDisplay;
    }
    if (currency) cost.currency = currency;
    options.cost = cost;
  }

  if (isRecord(raw.context)) {
    const context: NonNullable<StatusLineSegmentOptions["context"]> = {};
    if (raw.context.format === "full" || raw.context.format === "percent") {
      context.format = raw.context.format;
    }
    options.context = context;
  }

  if (isRecord(raw.cache_read)) {
    const cacheRead: NonNullable<StatusLineSegmentOptions["cache_read"]> = {};
    if (
      raw.cache_read.format === "tokens" ||
      raw.cache_read.format === "percent" ||
      raw.cache_read.format === "both"
    ) {
      cacheRead.format = raw.cache_read.format;
    }
    options.cache_read = cacheRead;
  }

  if (isRecord(raw.openPorts)) {
    const openPorts: NonNullable<StatusLineSegmentOptions["openPorts"]> = {};
    if (typeof raw.openPorts.includeUdp === "boolean") {
      openPorts.includeUdp = raw.openPorts.includeUdp;
    }
    if (typeof raw.openPorts.host === "string" && raw.openPorts.host.trim()) {
      openPorts.host = raw.openPorts.host.trim();
    }
    options.openPorts = openPorts;
  }

  if (isRecord(raw.tps)) {
    const tps: NonNullable<StatusLineSegmentOptions["tps"]> = {};
    if (typeof raw.tps.windowMs === "number" && Number.isFinite(raw.tps.windowMs)) {
      tps.windowMs = Math.min(5000, Math.max(500, Math.floor(raw.tps.windowMs)));
    }
    options.tps = tps;
  }

  // Generic `template` override for every segment option group:
  // segmentOptions.<id>.template: "{value} tok/s" replaces the value text.
  const TEMPLATE_OPTION_KEYS = [
    "model",
    "path",
    "git",
    "time",
    "cost",
    "context",
    "cache_read",
    "openPorts",
    "tps",
  ] as const;
  const genericOptions = options as Record<
    (typeof TEMPLATE_OPTION_KEYS)[number],
    { template?: string } | undefined
  >;
  for (const key of TEMPLATE_OPTION_KEYS) {
    const rawOpt = raw[key];
    if (isRecord(rawOpt) && typeof rawOpt.template === "string") {
      const template = rawOpt.template.trim();
      if (template) {
        genericOptions[key] = { ...genericOptions[key], template };
      }
    }
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
