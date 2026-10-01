import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  firstRunTips,
  resolveWelcomePanel,
} from "../src/extension/welcome/welcome-integration.ts";
import { hasSeenVersion } from "../src/welcome/index.ts";
import { setLocale } from "../src/i18n/index.ts";

const originalAgentDir = process.env.PI_CODING_AGENT_DIR;

/**
 * Sandbox pi's agent dir so the seen-version state file is written to a temp
 * folder rather than the real `~/.pi/agent`.
 */
function sandbox(): { dir: string; restore: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "wishcraft-firstrun-"));
  process.env.PI_CODING_AGENT_DIR = dir;
  return {
    dir,
    restore: () => {
      if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test("first run shows three next steps instead of a changelog wall", () => {
  const agent = sandbox();
  try {
    assert.equal(hasSeenVersion(), false, "fresh agent dir = first run");

    const panel = resolveWelcomePanel();
    assert.equal(panel.title, "Getting started");
    assert.equal(panel.entries.length, 3);
    assert.match(panel.entries[0]!, /# <idea>/);
    assert.match(panel.entries[1]!, /alt\+p/);
    assert.match(panel.entries[2]!, /wishcraft setup/);
    // Every tip stays to one short line — no wall of text.
    for (const entry of panel.entries) {
      assert.ok(entry.length < 80, entry);
    }

    // The panel still records the seen version, so the next session is not
    // treated as a first run again.
    assert.equal(hasSeenVersion(), true);
  } finally {
    agent.restore();
  }
});

test("subsequent runs show the changelog delta under its own heading", () => {
  const agent = sandbox();
  try {
    resolveWelcomePanel(); // first run, records the version
    const panel = resolveWelcomePanel();
    assert.equal(panel.title, "What's new");
    // The seen version now equals the package version, so there is no newer
    // release to report — the important part is that the first-run tips no
    // longer leak into a normal session.
    assert.ok(panel.entries.length <= 8);
    for (const entry of panel.entries) {
      assert.doesNotMatch(entry, /# <idea>/, "first-run tips leaked");
      assert.ok(!entry.startsWith("-"), `raw bullet leaked: ${entry}`);
    }
  } finally {
    agent.restore();
  }
});

test("first-run tips are localised", () => {
  setLocale("nl");
  try {
    const tips = firstRunTips();
    assert.equal(tips.length, 3);
    assert.match(tips[0]!, /gedachte/);
    assert.match(tips[1]!, /Deck/);
    assert.match(tips[2]!, /taal/);
  } finally {
    setLocale("en");
  }

  const english = firstRunTips();
  assert.match(english[0]!, /# <idea>/);
});

test("firstRunTips stays short in both locales", () => {
  for (const locale of ["en", "nl"] as const) {
    setLocale(locale);
    try {
      for (const tip of firstRunTips()) {
        assert.ok(tip.trim().length > 0, locale);
        assert.ok(tip.length < 80, `${locale}: ${tip}`);
        assert.equal(tip.includes("\n"), false);
      }
    } finally {
      setLocale("en");
    }
  }
});
