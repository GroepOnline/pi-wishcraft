import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  LOCALES,
  NL,
  getLocale,
  isLocale,
  isTranslated,
  localeFromSettings,
  messageCount,
  resolveLocale,
  setLocale,
  tr,
} from "../src/i18n/index.ts";
import {
  SETTINGS_REGISTRY,
  SETTING_GROUPS,
  settingGroupTitle,
  settingHint,
  settingLabel,
} from "../src/config/settings-registry.ts";
import {
  BUILTIN_DECK_ROUTE_DEFS,
  routeDescription,
  routeLabel,
} from "../src/extension/ui/deck/routes.ts";

/** Run `body` with `locale`, always restoring English for the next test. */
function withLocale(locale: string, body: () => void): void {
  const previous = getLocale();
  try {
    setLocale(locale);
    body();
  } finally {
    setLocale(previous === "en" ? "en" : previous);
    setLocale("en");
  }
}

test("resolveLocale accepts supported locales and region variants", () => {
  assert.equal(resolveLocale("en"), "en");
  assert.equal(resolveLocale("nl"), "nl");
  assert.equal(resolveLocale("NL"), "nl");
  assert.equal(resolveLocale(" nl "), "nl");
  assert.equal(resolveLocale("nl-NL"), "nl");
  assert.equal(resolveLocale("nl_BE"), "nl");
  assert.equal(resolveLocale("en-US"), "en");
});

test("resolveLocale falls back to English for anything else", () => {
  assert.equal(resolveLocale(undefined), "en");
  assert.equal(resolveLocale(null), "en");
  assert.equal(resolveLocale(42), "en");
  assert.equal(resolveLocale(""), "en");
  assert.equal(resolveLocale("   "), "en");
  assert.equal(resolveLocale("de"), "en");
  assert.equal(resolveLocale("fr-FR"), "en");
  assert.equal(resolveLocale({ locale: "nl" }), "en");
});

test("isLocale only accepts catalogued locales", () => {
  for (const locale of LOCALES) assert.equal(isLocale(locale), true);
  assert.equal(isLocale("de"), false);
  assert.equal(isLocale(undefined), false);
});

test("tr returns the English literal by default and interpolates it", () => {
  assert.equal(getLocale(), "en");
  assert.equal(tr("deck.home.label", "Home"), "Home");
  // Regression: the English fast path must interpolate too, otherwise the
  // default locale printed raw `{route}` placeholders.
  assert.equal(
    tr("deck.activeRoute", "ACTIVE ROUTE: {route}", { route: "HOME" }),
    "ACTIVE ROUTE: HOME",
  );
  assert.equal(
    tr("missing.key", "{n} of {total}", { n: 2, total: 5 }),
    "2 of 5",
  );
});

test("tr leaves unknown placeholders untouched", () => {
  assert.equal(tr("x", "hello {name}", { other: "1" }), "hello {name}");
});

test("tr serves the Dutch catalog when nl is active", () => {
  withLocale("nl", () => {
    assert.equal(tr("deck.home.label", "Home"), "Start");
    assert.equal(tr("welcome.signals", "Signals & Wishes"), "Signalen & wensen");
    assert.equal(
      tr("deck.activeRoute", "ACTIVE ROUTE: {route}", { route: "START" }),
      "ACTIEVE ROUTE: START",
    );
    // Unknown key still degrades to English rather than blanking.
    assert.equal(tr("nope.not.a.key", "Fallback text"), "Fallback text");
    assert.equal(isTranslated("deck.home.label"), true);
    assert.equal(isTranslated("nope.not.a.key"), false);
  });
  assert.equal(getLocale(), "en");
  assert.equal(isTranslated("deck.home.label"), false);
});

test("English has no catalog by design; Dutch does", () => {
  assert.equal(messageCount("en"), 0);
  assert.ok(messageCount("nl") > 100);
});

test("localeFromSettings reads wishcraft.locale first, then powerline.locale", () => {
  assert.equal(localeFromSettings({}), "en");
  assert.equal(localeFromSettings({ wishcraft: { locale: "nl" } }), "nl");
  assert.equal(localeFromSettings({ powerline: { locale: "nl" } }), "nl");
  assert.equal(
    localeFromSettings({
      powerline: { locale: "nl" },
      wishcraft: { locale: "en" },
    }),
    "en",
  );
  // Malformed values degrade to English instead of throwing.
  assert.equal(localeFromSettings({ wishcraft: { locale: 7 } }), "en");
  assert.equal(
    localeFromSettings({ wishcraft: { locale: "de-DE" } }),
    "en",
  );
});

test("Dutch catalog has no blank values", () => {
  for (const [key, value] of Object.entries(NL)) {
    assert.ok(value.trim().length > 0, `${key} is blank`);
    assert.equal(typeof value, "string");
  }
});

test("every statically referenced message key has a Dutch entry", () => {
  const root = new URL("..", import.meta.url).pathname;
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith(".ts")) files.push(path);
    }
  };
  walk(join(root, "src"));
  walk(join(root, "bash-mode"));
  walk(join(root, "queue"));
  files.push(join(root, "index.ts"));

  const used = new Set<string>();
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    // Only literal keys; template keys (`setting.${id}.label`) are covered by
    // the dynamic registry/route checks below. Keys without a namespace dot
    // are documentation examples inside comments.
    for (const match of source.matchAll(/\btr\(\s*"([^"]+)"/g)) {
      if (match[1]!.includes(".")) used.add(match[1]!);
    }
    for (const match of source.matchAll(/\btr\(\s*`([^`$]+)`/g)) {
      if (match[1]!.includes(".")) used.add(match[1]!);
    }
  }

  assert.ok(used.size > 40, `expected many keys, found ${used.size}`);
  const missing = [...used].filter((key) => !(key in NL)).sort();
  assert.deepEqual(missing, [], `missing Dutch entries: ${missing.join(", ")}`);
});

test("every settings group is translated", () => {
  for (const group of SETTING_GROUPS) {
    assert.ok(
      `group.${group.id}` in NL,
      `missing Dutch title for group ${group.id}`,
    );
    assert.ok(settingGroupTitle(group).length > 0);
  }
});

test("every built-in Deck route is translated", () => {
  for (const def of BUILTIN_DECK_ROUTE_DEFS) {
    assert.ok(`deck.${def.id}.label` in NL, `missing label for ${def.id}`);
    assert.ok(`deck.${def.id}.desc` in NL, `missing description for ${def.id}`);
  }
  withLocale("nl", () => {
    for (const def of BUILTIN_DECK_ROUTE_DEFS) {
      assert.ok(routeLabel(def).length > 0, def.id);
      // Descriptions are full sentences, so they must all differ; some
      // labels are loanwords in Dutch too ("Skills", "Shell", "Diagnose").
      assert.notEqual(routeDescription(def), def.description, def.id);
    }
  });
});

test("setting labels and hints resolve in both locales", () => {
  assert.equal(getLocale(), "en");
  for (const definition of SETTINGS_REGISTRY) {
    assert.ok(settingLabel(definition).length > 0, definition.id);
    if (definition.hint !== undefined) {
      assert.equal(settingHint(definition), definition.hint);
    } else {
      assert.equal(settingHint(definition), undefined);
    }
  }

  withLocale("nl", () => {
    for (const definition of SETTINGS_REGISTRY) {
      assert.ok(settingLabel(definition).length > 0, definition.id);
    }
    const language = SETTINGS_REGISTRY.find(
      (item) => item.id === "interface.language",
    );
    assert.ok(language);
    assert.equal(settingLabel(language), "Taal");
    const motion = SETTINGS_REGISTRY.find((item) => item.id === "motion.level");
    assert.ok(motion);
    assert.equal(settingLabel(motion), "Bewegingsniveau");
  });
});
