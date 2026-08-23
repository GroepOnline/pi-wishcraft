import {
  formatSkillsCountStatusValue,
  publishPowerlineStatuses,
} from "../core/status-export.ts";
import {
  invalidateSkillCache,
  loadSkillCatalog,
  setSkillCacheInvalidationHandler,
} from "./skill-registry.ts";

type SkillsCountCtx = {
  cwd?: string;
  ui?: { setStatus?: (key: string, value: string | undefined) => void };
};

function publishSkillsCount(ctx: SkillsCountCtx): void {
  publishPowerlineStatuses(ctx, {
    skillsCount: formatSkillsCountStatusValue(
      loadSkillCatalog(ctx.cwd ?? process.cwd()).length,
    ),
  });
}

/** Drop the session-scoped publisher so later invalidations cannot use a stale UI. */
export function clearSkillsCountPublisher(): void {
  setSkillCacheInvalidationHandler(null);
}

/**
 * Publish `powerline.skills.count` now and after every skill-cache invalidation.
 * Replaces any previous session callback first.
 */
export function bindSkillsCountPublisher(ctx: SkillsCountCtx): void {
  clearSkillsCountPublisher();
  setSkillCacheInvalidationHandler(() => publishSkillsCount(ctx));
  invalidateSkillCache();
}
