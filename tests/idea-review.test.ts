import test from "node:test";
import assert from "node:assert/strict";

import type { PowerlineQueueItem } from "../queue/types.ts";
import {
  buildIdeaActionItems,
  buildIdeaPickerItems,
  buildReviewStatusItems,
  buildTagItems,
  composeSkillIdeaInsert,
  formatIdeaReviewLabel,
  ideaReviewStatusOf,
  pickNextReviewIdea,
  toggleIdeaTag,
} from "../src/extension/queue/idea-review.ts";
import { QueueWidget } from "../src/welcome/widgets/queue-widget.ts";

function idea(
  overrides: Partial<PowerlineQueueItem> & Pick<PowerlineQueueItem, "id" | "text">,
): PowerlineQueueItem {
  return {
    createdAt: 1,
    updatedAt: 1,
    source: { cwd: "/tmp/project" },
    target: { kind: "current-session" },
    intent: "idea",
    status: "queued",
    ...overrides,
  };
}

test("legacy ideas default to review status idea without mutating the item", () => {
  const item = idea({ id: "ab12cd34", text: "check logs" });
  assert.equal(ideaReviewStatusOf(item), "idea");
  assert.equal(item.reviewStatus, undefined);
});

test("formatIdeaReviewLabel includes status and tags", () => {
  const labeled = formatIdeaReviewLabel(
    idea({
      id: "ab12cd34",
      text: "check the deploy logs after rollout",
      reviewStatus: "in-progress",
      tags: ["later", "review"],
    }),
  );
  assert.match(labeled, /^ab12cd34 in-progress \[later, review\] /);
});

test("picker and action items stay in overlay chrome values", () => {
  const items = [
    idea({ id: "one", text: "first", reviewStatus: "idea" }),
    idea({ id: "two", text: "second", reviewStatus: "done", tags: ["chore"] }),
  ];
  assert.deepEqual(
    buildIdeaPickerItems(items).map((entry) => entry.value),
    ["one", "two"],
  );
  const actions = buildIdeaActionItems(items[0]!);
  assert.deepEqual(
    actions.map((entry) => entry.value),
    ["send", "skill", "status", "tags", "edit", "clear", "cancel"],
  );
  assert.equal(
    actions.find((entry) => entry.value === "skill")?.label,
    "Run with skill X",
  );
});

test("review status and tag builders expose presets without Dutch copy", () => {
  const statuses = buildReviewStatusItems("idea");
  assert.deepEqual(
    statuses.map((entry) => entry.value),
    ["idea", "in-progress", "done"],
  );
  assert.equal(statuses[0]?.label, "idea (current)");

  const tags = buildTagItems(["later"]);
  assert.equal(tags.find((entry) => entry.value === "toggle:later")?.label, "✓ later");
  assert.ok(tags.some((entry) => entry.value === "clear"));
  assert.doesNotMatch(JSON.stringify(tags), /verwerk|idee|taggen/i);
});

test("toggleIdeaTag adds, removes, and clears", () => {
  assert.deepEqual(toggleIdeaTag(undefined, "later"), ["later"]);
  assert.deepEqual(toggleIdeaTag(["later"], "bug"), ["later", "bug"]);
  assert.equal(toggleIdeaTag(["later"], "later"), undefined);
});

test("composeSkillIdeaInsert reuses the manager insert path shape", () => {
  assert.equal(
    composeSkillIdeaInsert("Use the browser workflow.", "check logs"),
    "Use the browser workflow.\n\ncheck logs",
  );
  assert.equal(composeSkillIdeaInsert("", "check logs"), "check logs");
  assert.equal(composeSkillIdeaInsert("body only", ""), "body only");
});

test("pickNextReviewIdea skips done items then falls back", () => {
  const done = idea({ id: "doneidea", text: "old", reviewStatus: "done" });
  const open = idea({ id: "openidea", text: "next", reviewStatus: "idea" });
  assert.equal(pickNextReviewIdea([done, open])?.id, "openidea");
  assert.equal(pickNextReviewIdea([done])?.id, "doneidea");
  assert.equal(pickNextReviewIdea([]), null);
});

test("QueueWidget shows next idea preview and /ideas next, not enter-to-send", () => {
  const ctx = {
    data: {
      modelName: "m",
      providerName: "p",
      recentSessions: [],
      loadedCounts: {
        contextFiles: 0,
        extensions: 0,
        skills: 0,
        promptTemplates: 0,
      },
      initialContextTokens: null,
      nextIdeaText: "file the ports regression",
    },
    width: 80,
    dim: (text: string) => text,
    bold: (text: string) => text,
    color: (_semantic: string, text: string) => text,
  };
  const lines = QueueWidget.render(ctx);
  assert.match(lines.join("\n"), /file the ports regression/);
  assert.match(lines.join("\n"), /\/ideas next/);
  assert.doesNotMatch(lines.join("\n"), /enter to send/i);
});
