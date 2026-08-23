import test from "node:test";
import assert from "node:assert/strict";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { PowerlineQueueStore, currentQueueContext, formatIdeaIssuePrompt, formatQueueDeliveryText, parseCompactQueuedPrompt, parseSigilIdeaCapture, parseTargetPrefix, targetForIdea } from "../queue/store.ts";

function withStore(fn: (store: PowerlineQueueStore, dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "powerline-queue-"));
  try {
    fn(
      new PowerlineQueueStore(
        join(dir, "inbox.jsonl"),
        join(dir, "projects.json"),
        join(dir, "inbox.archive.jsonl"),
      ),
      dir,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("queue store adds active project ideas and summarizes them", () => withStore((store) => {
  const cwd = "/tmp/project-a";
  store.add({
    text: "remember deploy note",
    source: { cwd, sessionId: "s1" },
    target: { kind: "project", cwd },
    intent: "idea",
    now: 100,
  });
  store.add({
    text: "run after compact",
    source: { cwd, sessionId: "s1" },
    target: { kind: "current-session" },
    intent: "post-compact",
    now: 101,
  });

  assert.equal(store.list().length, 2);
  assert.deepEqual(store.summarize(currentQueueContext(cwd, "s1"), true), {
    queueCount: 1,
    ideaCount: 1,
    blockedCount: 0,
    compacting: true,
    leadingText: "run after compact",
    leadingIntent: "post-compact",
    leadingStatus: "queued",
  });
}));

test("queue store filters inactive project items", () => withStore((store) => {
  store.add({
    text: "other project",
    source: { cwd: "/tmp/project-a" },
    target: { kind: "project", cwd: "/tmp/project-a" },
    intent: "idea",
  });

  assert.equal(store.activeItems(currentQueueContext("/tmp/project-b")).length, 0);
  assert.equal(store.activeItems(currentQueueContext("/tmp/project-a")).length, 1);
}));

test("queue store exposes the leading item intent for idea-only summaries", () => withStore((store) => {
  store.add({
    text: "saved follow-up idea",
    source: { cwd: "/tmp/project" },
    target: { kind: "project", cwd: "/tmp/project" },
    intent: "idea",
    now: 100,
  });

  assert.deepEqual(store.summarize(currentQueueContext("/tmp/project"), false), {
    queueCount: 0,
    ideaCount: 1,
    blockedCount: 0,
    compacting: false,
    leadingText: "saved follow-up idea",
    leadingIntent: "idea",
    leadingStatus: "queued",
  });
}));

test("current-session targets stay scoped to the source session when known", () => withStore((store) => {
  store.add({
    text: "session only",
    source: { cwd: "/tmp/project", sessionId: "s1" },
    target: { kind: "current-session" },
    intent: "post-compact",
  });

  assert.equal(store.activeItems(currentQueueContext("/tmp/project", "s1")).length, 1);
  assert.equal(store.activeItems(currentQueueContext("/tmp/project", "s2")).length, 0);
}));

test("queue store aliases resolve idea targets", () => withStore((store) => {
  store.setAlias("pika", "/tmp/pika");

  assert.deepEqual(targetForIdea("pika", store, "/tmp/current"), {
    kind: "project",
    cwd: resolve("/tmp/pika"),
    alias: "pika",
  });
  assert.deepEqual(targetForIdea("global", store, "/tmp/current"), { kind: "global" });
  assert.deepEqual(targetForIdea("current", store, "/tmp/current"), { kind: "current-session" });
  assert.throws(() => targetForIdea("missing", store, "/tmp/current"), /Unknown project alias/);
}));

test("parseTargetPrefix separates optional @target", () => {
  assert.deepEqual(parseTargetPrefix("@pika check logs"), { target: "pika", text: "check logs" });
  assert.deepEqual(parseTargetPrefix("plain idea"), { target: null, text: "plain idea" });
});

test("parseSigilIdeaCapture turns leading sigil text into target-aware ideas", () => {
  assert.deepEqual(parseSigilIdeaCapture("# check logs", "#"), { target: null, text: "check logs" });
  assert.deepEqual(parseSigilIdeaCapture("# @global check logs", "#"), { target: "global", text: "check logs" });
  assert.deepEqual(parseSigilIdeaCapture("# @pika check logs\nthen inspect events", "#"), {
    target: "pika",
    text: "check logs\nthen inspect events",
  });
  assert.deepEqual(parseSigilIdeaCapture("note # check logs", "#"), null);
  assert.deepEqual(parseSigilIdeaCapture("## markdown heading", "#"), null);
  assert.deepEqual(parseSigilIdeaCapture("#   ", "#"), null);
  assert.deepEqual(parseSigilIdeaCapture("# check logs", false), null);
  assert.deepEqual(parseSigilIdeaCapture("// check logs", "//"), { target: null, text: "check logs" });
});

test("formatQueueDeliveryText adds provenance only for ideas", () => {
  const idea = {
    id: "a1b2c3d4",
    text: "check logs",
    createdAt: 1000,
    updatedAt: 1000,
    source: { cwd: "/tmp/project" },
    target: { kind: "current-session" as const },
    intent: "idea" as const,
    status: "queued" as const,
  };
  const prompt = { ...idea, intent: "follow-up" as const };

  assert.equal(
    formatQueueDeliveryText(idea),
    "[powerline idea a1b2c3d4, captured 1970-01-01T00:00:01.000Z from /tmp/project]\ncheck logs",
  );
  assert.equal(formatQueueDeliveryText(prompt), "check logs");
});

test("formatIdeaIssuePrompt requires dedupe and clear owned repo before filing", () => {
  const prompt = formatIdeaIssuePrompt({
    id: "a1b2c3d4",
    text: "add typed issue handoff",
    createdAt: 1000,
    updatedAt: 1000,
    source: { cwd: "/tmp/project" },
    target: { kind: "project", cwd: "/tmp/project", alias: "powerline" },
    intent: "idea",
    status: "queued",
  });

  assert.match(prompt, /spawn one low-budget issue-filing lane/);
  assert.match(prompt, /target repository is unclear or is not owned\/controlled by the user, ask before filing/);
  assert.match(prompt, /dedupe against existing open issues first/);
  assert.match(prompt, /If a matching open issue already exists, report it and do not create another issue/);
  assert.match(prompt, /create one self-contained GitHub issue/);
  assert.match(prompt, /project @powerline \/tmp\/project/);
});

test("parseCompactQueuedPrompt treats /compact suffix as queued prompt text", () => {
  assert.equal(parseCompactQueuedPrompt("/compact great lets proceed"), "great lets proceed");
  assert.equal(parseCompactQueuedPrompt("  /compact   great lets proceed  "), "great lets proceed");
  assert.equal(parseCompactQueuedPrompt("/compact\tgreat lets proceed"), "great lets proceed");
  assert.equal(parseCompactQueuedPrompt("/compact"), null);
  assert.equal(parseCompactQueuedPrompt("/compact   "), null);
  assert.equal(parseCompactQueuedPrompt("/compactness great lets proceed"), null);
});

test("queue store clears items from active summary", () => withStore((store) => {
  const item = store.add({
    text: "queued prompt",
    source: { cwd: "/tmp/project" },
    target: { kind: "current-session" },
    intent: "post-compact",
  });

  assert.equal(store.summarize(currentQueueContext("/tmp/project"), false).queueCount, 1);
  store.clear(item.id);
  assert.equal(store.summarize(currentQueueContext("/tmp/project"), false).queueCount, 0);
}));

test("queue store times out instead of stealing an existing lock", () => withStore((store, dir) => {
  const lockPath = join(dir, "inbox.jsonl.lock");
  mkdirSync(lockPath);

  assert.throws(() => store.add({
    text: "blocked write",
    source: { cwd: "/tmp/project" },
    target: { kind: "project", cwd: "/tmp/project" },
    intent: "idea",
  }), /Timed out waiting for Powerline queue store lock/);
  assert.equal(existsSync(lockPath), true);
}));

test("archiveSentItems moves old sent items to the archive file", () => withStore((store, dir) => {
  const archivePath = join(dir, "inbox.archive.jsonl");
  const recent = store.add({
    text: "recent sent prompt",
    source: { cwd: "/tmp/project" },
    target: { kind: "project", cwd: "/tmp/project" },
    intent: "follow-up",
    now: Date.now() - 1000,
  });
  const queued = store.add({
    text: "still queued",
    source: { cwd: "/tmp/project" },
    target: { kind: "project", cwd: "/tmp/project" },
    intent: "idea",
    now: Date.now() - 1000,
  });
  store.update(recent.id, { status: "sent", updatedAt: Date.now() });

  // Seed an old sent item directly into the file (update() would prune it on write).
  const oldId = "old0001";
  appendFileSync(
    join(dir, "inbox.jsonl"),
    JSON.stringify({
      id: oldId,
      text: "old sent prompt",
      createdAt: 100,
      updatedAt: 100,
      source: { cwd: "/tmp/project" },
      target: { kind: "project", cwd: "/tmp/project" },
      intent: "follow-up",
      status: "sent",
    }) + "\n",
  );

  const result = store.archiveSentItems(60 * 60 * 1000);
  assert.equal(result.archived, 1);
  assert.equal(result.remainingSent, 1);

  const ids = store.list().map((item) => item.id);
  assert.ok(ids.includes(recent.id));
  assert.ok(ids.includes(queued.id));
  assert.ok(!ids.includes(oldId));

  const archivedLines = existsSync(archivePath)
    ? readFileSync(archivePath, "utf-8").trim().split("\n").filter(Boolean)
    : [];
  assert.equal(archivedLines.length, 1);
  assert.match(archivedLines[0] ?? "", /old sent prompt/);
}));

test("archiveSentItems is a no-op when everything is fresh or active", () => withStore((store, dir) => {
  const fresh = store.add({
    text: "fresh sent",
    source: { cwd: "/tmp/project" },
    target: { kind: "project", cwd: "/tmp/project" },
    intent: "follow-up",
    now: Date.now() - 1000,
  });
  store.update(fresh.id, { status: "sent", updatedAt: Date.now() });
  const result = store.archiveSentItems(60 * 60 * 1000);
  assert.deepEqual(result, { archived: 0, remainingSent: 1 });
  assert.equal(existsSync(join(dir, "inbox.archive.jsonl")), false);
}));

test("sent retention is configurable and prunes older completed items", () => withStore((store, dir) => {
  const old = store.add({
    text: "old completed",
    source: { cwd: "/tmp/project" },
    target: { kind: "project", cwd: "/tmp/project" },
    intent: "follow-up",
    now: Date.now() - 3 * 60 * 60 * 1000,
  });
  store.update(old.id, { status: "sent", updatedAt: Date.now() - 3 * 60 * 60 * 1000 });

  // Default retention (24h) keeps the item; a 1h retention prunes it on next write.
  assert.equal(store.list().length, 1);
  store.setSentRetentionMs(60 * 60 * 1000);
  store.add({
    text: "triggers rewrite",
    source: { cwd: "/tmp/project" },
    target: { kind: "project", cwd: "/tmp/project" },
    intent: "idea",
    now: Date.now(),
  });
  assert.equal(store.list().length, 1);
}));

test("archiveSentItems clamps a wider window to the retention so no sent item is dropped", () => withStore((store, dir) => {
  const archivePath = join(dir, "inbox.archive.jsonl");
  store.setSentRetentionMs(60 * 60 * 1000); // 1h retention

  const now = Date.now();
  const freshId = "fresh001";
  const middleId = "middle01";
  appendFileSync(
    join(dir, "inbox.jsonl"),
    [
      JSON.stringify({
        id: freshId,
        text: "fresh sent",
        createdAt: now - 30 * 60 * 1000,
        updatedAt: now - 30 * 60 * 1000,
        source: { cwd: "/tmp/project" },
        target: { kind: "project", cwd: "/tmp/project" },
        intent: "follow-up",
        status: "sent",
      }),
      JSON.stringify({
        id: middleId,
        text: "middle sent",
        createdAt: now - 2 * 60 * 60 * 1000,
        updatedAt: now - 2 * 60 * 60 * 1000,
        source: { cwd: "/tmp/project" },
        target: { kind: "project", cwd: "/tmp/project" },
        intent: "follow-up",
        status: "sent",
      }),
    ].join("\n") + "\n",
  );

  // Archive with a 3h window; retention (1h) must win so the 2h-old item is
  // archived instead of silently pruned and misreported as remaining.
  const result = store.archiveSentItems(3 * 60 * 60 * 1000);
  assert.equal(result.archived, 1);
  assert.equal(result.remainingSent, 1);

  const ids = store.list().map((item) => item.id);
  assert.deepEqual(ids, [freshId]);

  const archivedLines = readFileSync(archivePath, "utf-8")
    .trim()
    .split("\n")
    .filter(Boolean);
  assert.equal(archivedLines.length, 1);
  assert.match(archivedLines[0] ?? "", /middle sent/);
}));

test("setSentRetentionMs clamps below one hour", () => withStore((store) => {
  store.setSentRetentionMs(0);
  const item = store.add({
    text: "completed now",
    source: { cwd: "/tmp/project" },
    target: { kind: "project", cwd: "/tmp/project" },
    intent: "follow-up",
    now: Date.now() - 60 * 60 * 1000,
  });
  store.clear(item.id);
  assert.equal(store.list().length, 1); // 1h floor keeps a 1h-old sent item
}));

test("archiveSentItems keeps sent items exactly at the retention cutoff", () =>
  withStore((store, dir) => {
    store.setSentRetentionMs(60 * 60 * 1000);
    const now = 1_700_000_000_000;
    const boundaryId = "bound001";
    appendFileSync(
      join(dir, "inbox.jsonl"),
      JSON.stringify({
        id: boundaryId,
        text: "boundary sent",
        createdAt: now - 60 * 60 * 1000,
        updatedAt: now - 60 * 60 * 1000,
        source: { cwd: "/tmp/project" },
        target: { kind: "project", cwd: "/tmp/project" },
        intent: "follow-up",
        status: "sent",
      }) + "\n",
    );

    const result = store.archiveSentItems(60 * 60 * 1000, now);
    assert.equal(result.archived, 0);
    assert.equal(result.remainingSent, 1);
    assert.deepEqual(store.list().map((item) => item.id), [boundaryId]);
  }));

test("legacy idea JSONL lines still parse without reviewStatus or tags", () =>
  withStore((store, dir) => {
    appendFileSync(
      join(dir, "inbox.jsonl"),
      `${JSON.stringify({
        id: "legacy01",
        text: "old captured idea",
        createdAt: 100,
        updatedAt: 100,
        source: { cwd: "/tmp/project" },
        target: { kind: "project", cwd: "/tmp/project" },
        intent: "idea",
        status: "queued",
      })}\n`,
    );
    const item = store.get("legacy01");
    assert.ok(item);
    assert.equal(item.intent, "idea");
    assert.equal(item.reviewStatus, undefined);
    assert.equal(item.tags, undefined);
  }));

test("new ideas persist reviewStatus and ignore duplicate tags", () =>
  withStore((store) => {
    const item = store.add({
      text: "tagged thought",
      source: { cwd: "/tmp/project" },
      target: { kind: "project", cwd: "/tmp/project" },
      intent: "idea",
      tags: ["later", "later", "  ", "review"],
    });
    assert.equal(item.reviewStatus, "idea");
    assert.deepEqual(item.tags, ["later", "review"]);

    store.update(item.id, { reviewStatus: "in-progress", tags: ["bug"] });
    const updated = store.get(item.id);
    assert.equal(updated?.reviewStatus, "in-progress");
    assert.deepEqual(updated?.tags, ["bug"]);

    store.update(item.id, { reviewStatus: "done", tags: undefined });
    const done = store.get(item.id);
    assert.equal(done?.reviewStatus, "done");
    assert.equal(done?.tags, undefined);
  }));
