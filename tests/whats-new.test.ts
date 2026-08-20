import test from "node:test";
import assert from "node:assert/strict";
import { parseChangelogDelta, WhatsNewWidget } from "../src/welcome/index.ts";

const dim = (text: string) => text;
const bold = (text: string) => text;
const color = (_semantic: string, text: string) => text;

test("parseChangelogDelta skips Unreleased and reads released versions newer than lastSeen", () => {
  const changelog = [
    "## [Unreleased]",
    "- ship-not-yet",
    "",
    "## [1.3.0]",
    "- added **live refresh**",
    "- added `bash init`",
    "",
    "## [1.2.0]",
    "- older change",
  ].join("\n");

  assert.deepEqual(parseChangelogDelta(changelog, null), [
    "added live refresh",
    "added `bash init`",
    "older change",
  ]);
  assert.deepEqual(parseChangelogDelta(changelog, "1.2.0"), [
    "added live refresh",
    "added `bash init`",
  ]);
  assert.deepEqual(parseChangelogDelta(changelog, "1.3.0"), []);
});

test("parseChangelogDelta ignores non-bullet lines and caps at maxLines", () => {
  const changelog = [
    "## [2.0.0]",
    "intro paragraph",
    "- first",
    "plain text",
    "- second",
    "- third",
    "- fourth",
  ].join("\n");

  assert.deepEqual(parseChangelogDelta(changelog, null, 2), ["first", "second"]);
});

test("parseChangelogDelta handles v-prefixed versions and strips bold markers", () => {
  const changelog = [
    "## [v1.0.0]",
    "- **bold** feature",
    "- plain feature",
  ].join("\n");

  assert.deepEqual(parseChangelogDelta(changelog, "0.9.0"), [
    "bold feature",
    "plain feature",
  ]);
});

test("WhatsNewWidget renders bullets when present and empty otherwise", () => {
  const base = { width: 80, dim, bold, color } as const;

  const withData = WhatsNewWidget.render({
    ...base,
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
      whatsNew: ["added doctor", "added export"],
    },
  });
  assert.deepEqual(withData, [
    " What's new",
    " • added doctor",
    " • added export",
  ]);

  const withoutData = WhatsNewWidget.render({
    ...base,
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
    },
  });
  assert.deepEqual(withoutData, []);
});
