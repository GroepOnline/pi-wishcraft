import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  DEFAULT_TOKENS as CONFIG_DEFAULT_TOKENS,
  colorSchemeFromTokens,
} from "../src/config/tokens.ts";
import {
  DEFAULT_TOKENS as THEME_DEFAULT_TOKENS,
  createTokens,
  deriveColorSchemeFromTokens,
} from "../src/theme/tokens/mapping.ts";
import { DEFAULT_MOTION_POLICY, MotionScheduler } from "../src/motion/index.ts";
import type { RenderScheduler } from "../src/render/timer.ts";
import { createSignalRuntime, setSignalEvent } from "../src/signal/controller.ts";

const root = join(import.meta.dirname, "..");

test("theme token compatibility bridge uses the canonical config mapping", () => {
  assert.deepEqual(THEME_DEFAULT_TOKENS, CONFIG_DEFAULT_TOKENS);
  const tokens = createTokens({ textMuted: "#334455", motionDim: "#112233" });
  const canonical = colorSchemeFromTokens(tokens);
  const compatibility = deriveColorSchemeFromTokens(tokens);
  assert.deepEqual(compatibility, canonical);
  assert.equal(compatibility.context, tokens.motionDim);
  assert.equal(compatibility.separator, tokens.motionDim);
});

test("Deck render hot path does not run static discovery or token-budget disk reads", () => {
  const component = readFileSync(
    join(root, "src/extension/ui/deck/component.ts"),
    "utf8",
  );
  const renderStart = component.indexOf("render(width: number) {");
  const inputStart = component.indexOf("handleInput(data: string)", renderStart);
  assert.ok(renderStart > -1 && inputStart > renderStart, "render block not found");
  const renderBlock = component.slice(renderStart, inputStart);
  assert.doesNotMatch(renderBlock, /buildDeckStaticSnapshot/);
  assert.doesNotMatch(renderBlock, /loadSkillCatalog/);
  assert.doesNotMatch(renderBlock, /collectSkillDoctorInputs/);
  assert.doesNotMatch(renderBlock, /readSettings/);

  const snapshots = readFileSync(
    join(root, "src/extension/ui/deck/session-snapshot.ts"),
    "utf8",
  );
  assert.match(snapshots, /export function buildDeckStaticSnapshot/);
  assert.match(snapshots, /staticSnapshot: DeckStaticSnapshot/);
  assert.match(snapshots, /includeTokenBudget: false/);
});

test("status segment context consumes cached token budget without filesystem reads", () => {
  const source = readFileSync(
    join(root, "src/extension/core/segment-context.ts"),
    "utf8",
  );
  assert.doesNotMatch(source, /readSettings/);
  assert.doesNotMatch(source, /loadUsageFileFromDisk/);
  assert.match(source, /rt\.tokenBudgetSnapshot/);
  assert.match(source, /tokenBudgetSnapshotForDay/);

  const notifications = readFileSync(
    join(root, "src/extension/session/session-notifications.ts"),
    "utf8",
  );
  assert.match(notifications, /export function refreshTokenBudgetSnapshot/);
  assert.match(
    notifications,
    /rt\.tokenBudgetSnapshot = \{ day, dailyLimit: daily, dailyUsed: used \}/,
  );
});

test("terminal Signal one-shots settle back to idle without a second timer", () => {
  let callback: (() => void) | null = null;
  let now = 0;
  const timer: RenderScheduler = {
    schedule() {},
    cancel() {},
  };
  const scheduler = new MotionScheduler({
    requestRender() {},
    createTimer(fn) {
      callback = fn;
      return timer;
    },
    now: () => now,
  });
  const policy = {
    ...DEFAULT_MOTION_POLICY,
    toggles: { ...DEFAULT_MOTION_POLICY.toggles },
  };
  const signal = createSignalRuntime(0);

  setSignalEvent(signal, scheduler, policy, "success", {
    maxTicks: 1,
    settleOnDone: true,
  });
  assert.equal(signal.activity, "done");
  assert.equal(signal.active, true);

  now += 1000;
  callback?.();

  assert.equal(signal.event, "idle");
  assert.equal(signal.activity, "ready");
  assert.equal(signal.active, false);
  assert.equal(scheduler.activeCount, 0);
});

test("release is blocked on the same reusable Verify contract as pull requests", () => {
  const verify = readFileSync(join(root, ".github/workflows/test.yml"), "utf8");
  assert.match(verify, /workflow_call:/);
  assert.match(verify, /git diff --check/);
  assert.match(verify, /run: npm run typecheck/);
  assert.match(verify, /run: npm test/);
  assert.match(verify, /run: npm run circular/);
  assert.match(verify, /run: npm run verify:package/);

  const release = readFileSync(join(root, ".github/workflows/release.yml"), "utf8");
  assert.match(release, /uses: \.\/\.github\/workflows\/test\.yml/);
  const verifyDependencies = release.match(/needs: verify/g) ?? [];
  assert.equal(verifyDependencies.length, 2, "candidate prep and tag publish must need verify");
  assert.match(release, /git rev-parse origin\/main/);
  assert.match(release, /actions\/workflows\/test\.yml\/dispatches/);

  const promote = readFileSync(
    join(root, ".github/workflows/promote-release-candidate.yml"),
    "utf8",
  );
  assert.match(promote, /workflow_run\.conclusion == 'success'/);
  assert.doesNotMatch(promote, /actions\/checkout/);
  assert.match(promote, /commits\/\$CANDIDATE_SHA/);
  assert.match(promote, /git\/refs\/heads\/main/);
  assert.match(promote, /refs\/tags\/\$TAG/);
});