import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import {
  captureIdeaFromText,
  deliverQueueItem,
  findNextIdea,
  openQueuePicker,
  requestQueueRender,
  resolveCommandTarget,
  sendIdeaIssueHandoffById,
  sendOrRetryQueueItem,
} from "../queue/queue-integration.ts";
import { openIdeasReview } from "../queue/idea-review.ts";
import { getCurrentEditorText } from "../shortcuts/shortcuts-router.ts";
import { getQueueContext } from "../queue/queue-context.ts";
import { config } from "../core/state.ts";
import type { RuntimeState } from "../core/types.ts";

export function registerQueueCommands(
  pi: ExtensionAPI,
  rt: RuntimeState,
): void {
  pi.registerCommand("idea", {
    description:
      "Capture an idea without interrupting the current agent. Usage: /idea [@alias|@global|@current] <text> | /idea issue [id]",
    handler: async (args, ctx) => {
      rt.currentCtx = ctx;
      const trimmedArgs = args.trim();
      const [action, id] = trimmedArgs.split(/\s+/).filter(Boolean);
      if (action === "issue") {
        sendIdeaIssueHandoffById(pi, rt, ctx, id);
        return;
      }

      const raw =
        trimmedArgs || getCurrentEditorText(ctx, rt.currentEditor).trim();
      if (!raw) {
        ctx.ui.notify(
          "Usage: /idea [@alias|@global|@current] <text> | /idea issue [id]",
          "info",
        );
        return;
      }

      try {
        const item = captureIdeaFromText(rt, ctx, raw);
        if (item && !trimmedArgs) {
          ctx.ui.setEditorText("");
        }
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          "error",
        );
      }
    },
  });

  pi.registerCommand("ideas", {
    description:
      "Review or send captured ideas. Usage: /ideas next | /ideas issue [id] | /ideas [send|retry|clear|edit] <id>",
    handler: async (args, ctx) => {
      rt.currentCtx = ctx;
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const action = parts[0];
      const id = parts[1];

      if (!action) {
        await openIdeasReview(pi, rt, ctx);
        return;
      }

      if (action === "next") {
        const item = findNextIdea(rt, ctx);
        if (!item) {
          ctx.ui.notify("No ideas captured", "info");
          return;
        }
        const updated = rt.queueStore.update(item.id, {
          status: "queued",
          target: { kind: "current-session" },
          reviewStatus: "in-progress",
          error: undefined,
        });
        if (updated) deliverQueueItem(pi, rt, ctx, updated);
        return;
      }

      if (action === "issue") {
        sendIdeaIssueHandoffById(pi, rt, ctx, id);
        return;
      }

      if (!id) {
        ctx.ui.notify(
          "Usage: /ideas next | /ideas issue [id] | /ideas [send|retry|clear|edit] <id>",
          "info",
        );
        return;
      }

      const item = rt.queueStore.get(id);
      if (!item || item.intent !== "idea") {
        ctx.ui.notify(`No unique idea matches ${id}`, "warning");
        return;
      }

      if (action === "send" || action === "retry") {
        const updated = rt.queueStore.update(item.id, {
          status: "queued",
          target: { kind: "current-session" },
          reviewStatus: "in-progress",
          error: undefined,
        });
        if (updated) deliverQueueItem(pi, rt, ctx, updated);
        return;
      }

      if (action === "edit") {
        ctx.ui.setEditorText(item.text);
        rt.queueStore.clear(item.id);
        requestQueueRender(rt);
        return;
      }

      if (action === "clear") {
        rt.queueStore.update(item.id, {
          status: "sent",
          reviewStatus: "done",
          error: undefined,
        });
        ctx.ui.notify(`Cleared idea ${item.id}`, "info");
        requestQueueRender(rt);
        return;
      }

      ctx.ui.notify(
        "Usage: /ideas next | /ideas issue [id] | /ideas [send|retry|clear|edit] <id>",
        "info",
      );
    },
  });

  pi.registerCommand("queue", {
    description: "Manage Powerline queued prompts and project aliases",
    handler: async (args, ctx) => {
      rt.currentCtx = ctx;
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const action = parts[0];

      if (!action) {
        await openQueuePicker(pi, rt, ctx, "queue");
        return;
      }

      if (action === "alias") {
        const alias = parts[1];
        const aliasPath = parts.slice(2).join(" ") || ctx.cwd || process.cwd();
        if (!alias) {
          ctx.ui.notify("Usage: /queue alias <name> [path]", "info");
          return;
        }
        try {
          rt.queueStore.setAlias(alias, aliasPath);
          ctx.ui.notify(`Alias @${alias} → ${aliasPath}`, "info");
        } catch (error) {
          ctx.ui.notify(
            error instanceof Error ? error.message : String(error),
            "error",
          );
        }
        return;
      }

      if (action === "send" || action === "retry") {
        const id = parts[1];
        if (!id) {
          const item = rt.queueStore.queuedDeliveryItems(
            getQueueContext(ctx),
          )[0];
          if (!item) {
            ctx.ui.notify("No queued item to send", "info");
            return;
          }
          sendOrRetryQueueItem(pi, rt, ctx, item.id);
          return;
        }
        sendOrRetryQueueItem(pi, rt, ctx, id);
        return;
      }

      if (action === "clear") {
        const id = parts[1];
        if (id === "all") {
          const active = rt.queueStore
            .activeItems(getQueueContext(ctx))
            .filter((item) => item.intent !== "idea");
          for (const item of active) rt.queueStore.clear(item.id);
          ctx.ui.notify(
            `Cleared ${active.length} queued item${active.length === 1 ? "" : "s"}`,
            "info",
          );
          requestQueueRender(rt);
          return;
        }
        if (!id) {
          ctx.ui.notify("Usage: /queue clear <id|all>", "info");
          return;
        }
        const item = rt.queueStore.get(id);
        if (!item || item.intent === "idea") {
          ctx.ui.notify(`No unique queued item matches ${id}`, "warning");
          return;
        }
        rt.queueStore.clear(item.id);
        ctx.ui.notify(`Cleared ${item.id}`, "info");
        requestQueueRender(rt);
        return;
      }

      if (action === "archive") {
        const hoursArg = Number(parts[1]);
        const hours =
          Number.isFinite(hoursArg) && hoursArg > 0
            ? Math.min(hoursArg, 24 * 365)
            : config.queue.retentionHours;
        const result = rt.queueStore.archiveSentItems(
          hours * 60 * 60 * 1000,
        );
        if (result.archived === 0) {
          ctx.ui.notify(
            `Nothing to archive — ${result.remainingSent} sent item${result.remainingSent === 1 ? " is" : "s are"} newer than ${hours}h (retention: powerline.queue.retentionHours)`,
            "info",
          );
        } else {
          ctx.ui.notify(
            `Archived ${result.archived} sent item${result.archived === 1 ? "" : "s"} older than ${hours}h to inbox.archive.jsonl`,
            "info",
          );
        }
        requestQueueRender(rt);
        return;
      }

      if (action === "target") {
        const id = parts[1];
        const spec = parts[2];
        if (!id || !spec) {
          ctx.ui.notify(
            "Usage: /queue target <id> @alias|global|current",
            "info",
          );
          return;
        }
        const item = rt.queueStore.get(id);
        if (!item) {
          ctx.ui.notify(`No unique queue item matches ${id}`, "warning");
          return;
        }
        try {
          const target = resolveCommandTarget(rt, ctx, spec);
          rt.queueStore.update(item.id, { target });
          ctx.ui.notify(`Retargeted ${item.id}`, "info");
          requestQueueRender(rt);
        } catch (error) {
          ctx.ui.notify(
            error instanceof Error ? error.message : String(error),
            "error",
          );
        }
        return;
      }

      ctx.ui.notify(
        "Usage: /queue [send|retry|clear|target|alias|archive [hours]]",
        "info",
      );
    },
  });
}
