import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { SelectItem } from "@earendil-works/pi-tui";

import {
  formatIdeaIssuePrompt,
  formatQueueDeliveryText,
  parseTargetPrefix,
  targetForIdea,
} from "../../../queue/store.ts";
import type {
  PowerlineQueueItem,
  QueueIntent,
  QueueTarget,
} from "../../../queue/types.ts";
import { requestImmediateStatusRender } from "../core/segment-context.ts";
import { buildStashPreview } from "../history/stash-history.ts";
import { showSelectOverlay } from "../ui/menu-views.ts";
import { getQueueContext } from "./queue-context.ts";
import { isStaleExtensionContextError } from "../session/stale-context.ts";
import { config } from "../core/state.ts";
import type { RuntimeState } from "../core/types.ts";

export function requestQueueRender(rt: RuntimeState): void {
  requestImmediateStatusRender(rt, { deferDuringTyping: false });
}

export function queueItemLabel(item: PowerlineQueueItem): string {
  const status =
    item.status === "queued" ? item.intent : `${item.intent}/${item.status}`;
  return `${item.id} ${status} ${buildStashPreview(item.text, 56)}`;
}

export function queueItemDescription(item: PowerlineQueueItem): string {
  if (item.target.kind === "global") return "global";
  if (item.target.kind === "current-session") return "current session";
  return item.target.alias ? `@${item.target.alias}` : item.target.cwd;
}

export function captureQueueItem(
  rt: RuntimeState,
  ctx: any,
  text: string,
  intent: QueueIntent,
  target: QueueTarget,
): PowerlineQueueItem {
  const item = rt.queueStore.add({
    text,
    intent,
    target,
    source: getQueueContext(ctx),
  });
  requestQueueRender(rt);
  return item;
}

export function captureIdeaFromParsedInput(
  rt: RuntimeState,
  ctx: any,
  parsed: { target: string | null; text: string },
): PowerlineQueueItem | null {
  const trimmed = parsed.text.trim();
  if (!trimmed) {
    ctx.ui.notify("Nothing to capture", "info");
    return null;
  }

  const target = targetForIdea(
    parsed.target,
    rt.queueStore,
    ctx.cwd ?? process.cwd(),
  );
  const item = captureQueueItem(rt, ctx, trimmed, "idea", target);
  ctx.ui.notify(`Idea saved (${item.id}) — /ideas to review`, "info");
  return item;
}

export function captureIdeaFromText(
  rt: RuntimeState,
  ctx: any,
  text: string,
): PowerlineQueueItem | null {
  return captureIdeaFromParsedInput(rt, ctx, parseTargetPrefix(text));
}

export function captureCurrentProjectIdea(
  rt: RuntimeState,
  ctx: any,
  text: string,
): PowerlineQueueItem | null {
  const trimmed = text.trim();
  if (!trimmed) {
    ctx.ui.notify("Nothing to capture", "info");
    return null;
  }

  const item = captureQueueItem(rt, ctx, trimmed, "idea", {
    kind: "project",
    cwd: ctx.cwd ?? process.cwd(),
  });
  ctx.ui.notify(`Idea saved (${item.id}) — /ideas to review`, "info");
  return item;
}

export function isSigilIdeaDraft(text: string): boolean {
  const sigil = config.queue.captureSigil;
  if (sigil === false) return false;
  const normalizedSigil = sigil.trim();
  if (!normalizedSigil) return false;
  const trimmed = text.trimStart();
  return (
    trimmed.startsWith(normalizedSigil) &&
    /^\s/.test(trimmed.slice(normalizedSigil.length))
  );
}

export function captureSigilGlyph(): string {
  const sigil =
    config.queue.captureSigil === false ? "#" : config.queue.captureSigil;
  return Array.from(sigil)[0] ?? "#";
}

export function capturePostCompactPrompt(
  rt: RuntimeState,
  ctx: any,
  text: string,
): PowerlineQueueItem | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const item = captureQueueItem(rt, ctx, trimmed, "post-compact", {
    kind: "current-session",
  });
  ctx.ui.notify(`Queued for after compaction (${item.id})`, "info");
  return item;
}

export function deliveryModeForItem(
  ctx: any,
  item: PowerlineQueueItem,
): "steer" | "followUp" | undefined {
  const idle = typeof ctx.isIdle === "function" ? ctx.isIdle() : true;
  if (idle) return undefined;
  return item.intent === "steer" ? "steer" : "followUp";
}

export function deliverQueueItem(
  pi: ExtensionAPI,
  rt: RuntimeState,
  ctx: any,
  item: PowerlineQueueItem,
): boolean {
  if (rt.powerlineCompacting) {
    rt.queueStore.update(item.id, { status: "queued" });
    requestQueueRender(rt);
    return false;
  }

  rt.queueStore.update(item.id, { status: "delivering", error: undefined });
  requestQueueRender(rt);

  let sent = false;
  try {
    const deliverAs = deliveryModeForItem(ctx, item);
    const deliveryText = formatQueueDeliveryText(item);
    if (deliverAs) {
      pi.sendUserMessage(deliveryText, { deliverAs });
    } else {
      pi.sendUserMessage(deliveryText);
    }
    sent = true;
    rt.queueStore.update(item.id, { status: "sent", error: undefined });
    try {
      ctx.ui.notify(`Sent queued item ${item.id}`, "info");
    } catch (error) {
      if (!isStaleExtensionContextError(error)) throw error;
    }
    requestQueueRender(rt);
    return true;
  } catch (error) {
    if (isStaleExtensionContextError(error)) {
      // The extension context was replaced (reload/session swap) mid-delivery.
      // Leave the item queued so it can be retried instead of marking it failed.
      if (!sent) {
        rt.queueStore.update(item.id, { status: "queued", error: undefined });
        requestQueueRender(rt);
      }
      return false;
    }
    const message = error instanceof Error ? error.message : String(error);
    rt.queueStore.update(item.id, { status: "failed", error: message });
    ctx.ui.notify(`Failed to send ${item.id}: ${message}`, "error");
    requestQueueRender(rt);
    return false;
  }
}

export function schedulePostCompactionDelivery(
  pi: ExtensionAPI,
  rt: RuntimeState,
  ctx: any,
): void {
  if (rt.queueDeliveryTimer) clearTimeout(rt.queueDeliveryTimer);
  const queueContext = getQueueContext(ctx);
  const scheduledGeneration = rt.sessionGeneration;
  rt.queueDeliveryTimer = setTimeout(() => {
    rt.queueDeliveryTimer = null;
    if (scheduledGeneration !== rt.sessionGeneration) return;
    const item = rt.queueStore.queuedDeliveryItems(
      queueContext,
      "post-compact",
    )[0];
    if (!item) return;
    try {
      deliverQueueItem(pi, rt, ctx, item);
    } catch (error) {
      if (!isStaleExtensionContextError(error)) throw error;
    }
  }, 50);
}

export function blockPostCompactionQueue(
  rt: RuntimeState,
  ctx: any,
  errorMessage: string,
): void {
  const items = rt.queueStore.queuedDeliveryItems(
    getQueueContext(ctx),
    "post-compact",
  );
  for (const item of items) {
    rt.queueStore.update(item.id, { status: "blocked", error: errorMessage });
  }
  if (items.length > 0) {
    ctx.ui.notify(
      `Kept ${items.length} post-compaction item${items.length === 1 ? "" : "s"} blocked`,
      "warning",
    );
    requestQueueRender(rt);
  }
}

export function finishFailedCompaction(
  rt: RuntimeState,
  ctx: any,
  errorMessage: string,
): void {
  rt.powerlineCompacting = false;
  rt.deliverAfterRetrySettles = false;
  blockPostCompactionQueue(rt, ctx, errorMessage);
  requestQueueRender(rt);
}

export async function chooseQueueAction(
  pi: ExtensionAPI,
  rt: RuntimeState,
  ctx: any,
  item: PowerlineQueueItem,
): Promise<void> {
  const actions: SelectItem[] = [
    {
      value: "send",
      label: "Send to current session",
      description: "Deliver as prompt/follow-up",
    },
    {
      value: "edit",
      label: "Edit in prompt",
      description: "Move text into the editor",
    },
    {
      value: "retry",
      label: "Retry",
      description: "Mark queued and deliver",
    },
    { value: "clear", label: "Clear", description: "Mark item done" },
    { value: "cancel", label: "Cancel" },
  ];
  const selected = await showSelectOverlay(
    ctx,
    `Queue item ${item.id}`,
    buildStashPreview(item.text, 72),
    actions,
    actions.length,
  );
  if (!selected || selected.value === "cancel") return;

  if (selected.value === "send") {
    deliverQueueItem(pi, rt, ctx, item);
    return;
  }

  if (selected.value === "retry") {
    const updated = rt.queueStore.update(item.id, {
      status: "queued",
      error: undefined,
    });
    if (updated) deliverQueueItem(pi, rt, ctx, updated);
    return;
  }

  if (selected.value === "edit") {
    ctx.ui.setEditorText(item.text);
    rt.queueStore.clear(item.id);
    requestQueueRender(rt);
    return;
  }

  if (selected.value === "clear") {
    rt.queueStore.clear(item.id);
    ctx.ui.notify(`Cleared ${item.id}`, "info");
    requestQueueRender(rt);
  }
}

export async function openQueuePicker(
  pi: ExtensionAPI,
  rt: RuntimeState,
  ctx: any,
  mode: "ideas" | "queue",
): Promise<void> {
  const active = rt.queueStore
    .activeItems(getQueueContext(ctx))
    .filter((item) =>
      mode === "ideas" ? item.intent === "idea" : item.intent !== "idea",
    );
  if (active.length === 0) {
    ctx.ui.notify(
      mode === "ideas" ? "No ideas captured" : "No queued items",
      "info",
    );
    return;
  }

  const items: SelectItem[] = active.map((item) => ({
    value: item.id,
    label: queueItemLabel(item),
    description: queueItemDescription(item),
  }));
  const selected = await showSelectOverlay(
    ctx,
    mode === "ideas" ? "Powerline ideas" : "Powerline queue",
    "↑↓ navigate • enter manage • esc cancel",
    items,
    Math.min(active.length, 12),
  );
  if (!selected) return;

  const item = active.find((candidate) => candidate.id === selected.value);
  if (item) await chooseQueueAction(pi, rt, ctx, item);
}

export function resolveCommandTarget(
  rt: RuntimeState,
  ctx: any,
  spec: string,
): QueueTarget {
  const normalized = spec.trim().replace(/^@/, "");
  return targetForIdea(
    normalized || null,
    rt.queueStore,
    ctx.cwd ?? process.cwd(),
  );
}

export function sendOrRetryQueueItem(
  pi: ExtensionAPI,
  rt: RuntimeState,
  ctx: any,
  idPrefix: string,
): void {
  const item = rt.queueStore.get(idPrefix);
  if (!item) {
    ctx.ui.notify(`No unique queue item matches ${idPrefix}`, "warning");
    return;
  }
  const updated = rt.queueStore.update(item.id, {
    status: "queued",
    error: undefined,
  });
  if (updated) deliverQueueItem(pi, rt, ctx, updated);
}

export function findNextIdea(
  rt: RuntimeState,
  ctx: any,
): PowerlineQueueItem | null {
  const ideas = rt.queueStore
    .activeItems(getQueueContext(ctx))
    .filter((candidate) => candidate.intent === "idea");
  return (
    ideas.find((candidate) => candidate.reviewStatus !== "done") ??
    null ??
    null
  );
}

export function sendIdeaIssueHandoff(
  pi: ExtensionAPI,
  rt: RuntimeState,
  ctx: any,
  item: PowerlineQueueItem,
): void {
  rt.queueStore.update(item.id, { status: "delivering", error: undefined });
  requestQueueRender(rt);

  try {
    const deliverAs = deliveryModeForItem(ctx, item);
    const issuePrompt = formatIdeaIssuePrompt(item);
    if (deliverAs) {
      pi.sendUserMessage(issuePrompt, { deliverAs });
    } else {
      pi.sendUserMessage(issuePrompt);
    }
    rt.queueStore.update(item.id, { status: "sent", error: undefined });
    ctx.ui.notify(`Sent idea ${item.id} for issue triage`, "info");
    requestQueueRender(rt);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    rt.queueStore.update(item.id, { status: "failed", error: message });
    ctx.ui.notify(`Failed to send ${item.id}: ${message}`, "error");
    requestQueueRender(rt);
  }
}

export function sendIdeaIssueHandoffById(
  pi: ExtensionAPI,
  rt: RuntimeState,
  ctx: any,
  id: string | undefined,
): void {
  const item = id ? rt.queueStore.get(id) : findNextIdea(rt, ctx);
  if (!item || item.intent !== "idea") {
    ctx.ui.notify(
      id ? `No unique idea matches ${id}` : "No ideas captured",
      id ? "warning" : "info",
    );
    return;
  }
  sendIdeaIssueHandoff(pi, rt, ctx, item);
}
