/**
 * Idea-review overlay for `/ideas`.
 * Review language (`reviewStatus`, `tags`) is separate from delivery QueueStatus.
 * Overlay chrome matches `/skills` (showSelectOverlay, not ctx.ui.select).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { SelectItem } from "@earendil-works/pi-tui";

import {
  IDEA_REVIEW_STATUSES,
  type IdeaReviewStatus,
  type PowerlineQueueItem,
} from "../../../queue/types.ts";
import { buildStashPreview } from "../history/stash-history.ts";
import {
  loadSkillCatalog,
  readSkillBody,
  recordSkillUsage,
} from "../skills/skill-registry.ts";
import { showSelectOverlay } from "../ui/overlay-chrome.ts";
import type { RuntimeState } from "../core/types.ts";
import { getQueueContext } from "./queue-context.ts";
import {
  deliverQueueItem,
  requestQueueRender,
} from "./queue-integration.ts";

export const IDEA_TAG_PRESETS = [
  "review",
  "later",
  "bug",
  "feature",
  "chore",
] as const;

export function ideaReviewStatusOf(
  item: Pick<PowerlineQueueItem, "reviewStatus">,
): IdeaReviewStatus {
  return item.reviewStatus ?? "idea";
}

export function formatIdeaReviewLabel(
  item: PowerlineQueueItem,
  previewWidth = 48,
): string {
  const review = ideaReviewStatusOf(item);
  const tags = item.tags?.length ? ` [${item.tags.join(", ")}]` : "";
  return `${item.id} ${review}${tags} ${buildStashPreview(item.text, previewWidth)}`;
}

export function buildIdeaPickerItems(
  items: readonly PowerlineQueueItem[],
): SelectItem[] {
  return items.map((item) => ({
    value: item.id,
    label: formatIdeaReviewLabel(item),
    description: item.tags?.join(", ") || ideaReviewStatusOf(item),
  }));
}

export function buildIdeaActionItems(item: PowerlineQueueItem): SelectItem[] {
  const review = ideaReviewStatusOf(item);
  const tagSummary = item.tags?.length ? item.tags.join(", ") : "none";
  return [
    {
      value: "send",
      label: "Send to current session",
      description: "Deliver as a prompt",
    },
    {
      value: "skill",
      label: "Run with skill X",
      description: "Insert skill body plus this idea into the editor",
    },
    {
      value: "status",
      label: `Set status (${review})`,
      description: "idea / in-progress / done",
    },
    {
      value: "tags",
      label: `Tags (${tagSummary})`,
      description: "Toggle presets or clear",
    },
    {
      value: "edit",
      label: "Edit in prompt",
      description: "Move text into the editor",
    },
    {
      value: "clear",
      label: "Clear",
      description: "Mark delivery sent and review done",
    },
    { value: "cancel", label: "Cancel" },
  ];
}

export function buildReviewStatusItems(
  current: IdeaReviewStatus,
): SelectItem[] {
  return IDEA_REVIEW_STATUSES.map((status) => ({
    value: status,
    label: status === current ? `${status} (current)` : status,
    description:
      status === "idea"
        ? "Captured, not started"
        : status === "in-progress"
          ? "Being worked"
          : "Reviewed or finished",
  }));
}

export function buildTagItems(tags: readonly string[] | undefined): SelectItem[] {
  const current = new Set(tags ?? []);
  const items: SelectItem[] = IDEA_TAG_PRESETS.map((tag) => ({
    value: `toggle:${tag}`,
    label: current.has(tag) ? `✓ ${tag}` : tag,
    description: current.has(tag) ? "Remove tag" : "Add tag",
  }));
  items.push({
    value: "clear",
    label: "Clear tags",
    description: "Remove all tags",
  });
  items.push({ value: "back", label: "Back" });
  return items;
}

export function toggleIdeaTag(
  tags: readonly string[] | undefined,
  tag: string,
): string[] | undefined {
  const current = [...(tags ?? [])];
  const next = current.includes(tag)
    ? current.filter((entry) => entry !== tag)
    : [...current, tag];
  return next.length > 0 ? next : undefined;
}

export function composeSkillIdeaInsert(
  skillBody: string,
  ideaText: string,
): string {
  const body = skillBody.trim();
  const idea = ideaText.trim();
  if (!body) return idea;
  if (!idea) return body;
  return `${body}\n\n${idea}`;
}

export function pickNextReviewIdea(
  items: readonly PowerlineQueueItem[],
): PowerlineQueueItem | null {
  const ideas = items.filter((item) => item.intent === "idea");
  return (
    ideas.find((item) => ideaReviewStatusOf(item) !== "done") ??
    ideas[0] ??
    null
  );
}

function activeIdeas(rt: RuntimeState, ctx: any): PowerlineQueueItem[] {
  return rt.queueStore
    .activeItems(getQueueContext(ctx))
    .filter((item) => item.intent === "idea");
}

function insertSkillAndIdea(
  ctx: any,
  skillName: string,
  filePath: string,
  ideaText: string,
): void {
  const chunk = composeSkillIdeaInsert(readSkillBody(filePath), ideaText);
  const current = ctx.ui.getEditorText?.() ?? "";
  const separator = current && !current.endsWith("\n") ? "\n\n" : current ? "\n" : "";
  ctx.ui.setEditorText(`${current}${separator}${chunk}\n`);
  recordSkillUsage(skillName);
  ctx.ui.notify("Skill and idea inserted into the prompt", "info");
}

async function pickSkillForIdea(
  ctx: any,
  item: PowerlineQueueItem,
): Promise<void> {
  const entries = loadSkillCatalog(ctx.cwd ?? process.cwd());
  if (entries.length === 0) {
    ctx.ui.notify("No skills installed", "info");
    return;
  }
  const selected = await showSelectOverlay(
    ctx,
    `Run ${item.id} with skill`,
    "↑↓ navigate • enter insert • esc cancel",
    entries.map((entry) => ({
      value: entry.filePath,
      label: entry.name,
      description: entry.description || entry.category,
    })),
    Math.min(entries.length, 12),
  );
  if (!selected) return;
  const entry = entries.find((candidate) => candidate.filePath === selected.value);
  if (entry) insertSkillAndIdea(ctx, entry.name, entry.filePath, item.text);
}

async function chooseIdeaReviewAction(
  pi: ExtensionAPI,
  rt: RuntimeState,
  ctx: any,
  item: PowerlineQueueItem,
): Promise<void> {
  const selected = await showSelectOverlay(
    ctx,
    `Idea ${item.id}`,
    buildStashPreview(item.text, 72),
    buildIdeaActionItems(item),
    8,
  );
  if (!selected || selected.value === "cancel") return;

  if (selected.value === "send") {
    const updated = rt.queueStore.update(item.id, {
      status: "queued",
      target: { kind: "current-session" },
      reviewStatus: "in-progress",
      error: undefined,
    });
    if (updated) deliverQueueItem(pi, rt, ctx, updated);
    return;
  }

  if (selected.value === "skill") {
    await pickSkillForIdea(ctx, item);
    return;
  }

  if (selected.value === "status") {
    const next = await showSelectOverlay(
      ctx,
      `Status for ${item.id}`,
      "idea / in-progress / done",
      buildReviewStatusItems(ideaReviewStatusOf(item)),
      IDEA_REVIEW_STATUSES.length,
    );
    if (!next) return;
    rt.queueStore.update(item.id, {
      reviewStatus: next.value as IdeaReviewStatus,
    });
    ctx.ui.notify(`Idea ${item.id} → ${next.value}`, "info");
    requestQueueRender(rt);
    const fresh = rt.queueStore.get(item.id);
    if (fresh) await chooseIdeaReviewAction(pi, rt, ctx, fresh);
    return;
  }

  if (selected.value === "tags") {
    const next = await showSelectOverlay(
      ctx,
      `Tags for ${item.id}`,
      "enter toggles • esc back",
      buildTagItems(item.tags),
      IDEA_TAG_PRESETS.length + 2,
    );
    if (!next || next.value === "back") {
      const fresh = rt.queueStore.get(item.id);
      if (fresh) await chooseIdeaReviewAction(pi, rt, ctx, fresh);
      return;
    }
    const tags =
      next.value === "clear"
        ? undefined
        : toggleIdeaTag(item.tags, next.value.replace(/^toggle:/, ""));
    rt.queueStore.update(item.id, { tags });
    requestQueueRender(rt);
    const fresh = rt.queueStore.get(item.id);
    if (fresh) await chooseIdeaReviewAction(pi, rt, ctx, fresh);
    return;
  }

  if (selected.value === "edit") {
    ctx.ui.setEditorText(item.text);
    rt.queueStore.clear(item.id);
    requestQueueRender(rt);
    return;
  }

  if (selected.value === "clear") {
    rt.queueStore.update(item.id, {
      status: "sent",
      reviewStatus: "done",
      error: undefined,
    });
    ctx.ui.notify(`Cleared idea ${item.id}`, "info");
    requestQueueRender(rt);
  }
}

export async function openIdeasReview(
  pi: ExtensionAPI,
  rt: RuntimeState,
  ctx: any,
): Promise<void> {
  const ideas = activeIdeas(rt, ctx);
  if (ideas.length === 0) {
    ctx.ui.notify("No ideas captured", "info");
    return;
  }

  const selected = await showSelectOverlay(
    ctx,
    "Wishcraft ideas",
    "↑↓ navigate • enter review • esc cancel",
    buildIdeaPickerItems(ideas),
    Math.min(ideas.length, 12),
  );
  if (!selected) return;

  const item = ideas.find((candidate) => candidate.id === selected.value);
  if (item) await chooseIdeaReviewAction(pi, rt, ctx, item);
}
