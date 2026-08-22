import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config, createRuntimeState, setConfig } from "../src/extension/core/state.ts";
import { showSegmentNavigator } from "../src/extension/ui/segment-navigator.ts";

const source = readFileSync(
  join(import.meta.dirname, "../src/extension/ui/segment-navigator.ts"),
  "utf8",
);

test("segment navigator snapshots on detail open and does not run a live timer", () => {
  assert.match(source, /const snapshot = /);
  assert.match(source, /openDetail[\s\S]*snapshot\(\)/);
  assert.match(source, /const selectedValue = selectList\.getSelectedItem\(\)\?\.value/);
  assert.match(source, /selectList = makeSelectList\(\)/);
  assert.match(source, /items\.findIndex\([\s\S]*item\.value === selectedValue/);
  assert.match(source, /invalidate: \(\) => \{[\s\S]*snapshot\(\);[\s\S]*selectList\.invalidate\(\)/);
  assert.doesNotMatch(source, /setInterval\(/);
  assert.doesNotMatch(source, /SEGMENT_NAVIGATOR_REFRESH_MS/);
});

function navigatorHarness() {
  const originalConfig = config;
  setConfig({
    ...originalConfig,
    preset: "minimal",
    disabledSegments: [],
    invalidDisabledSegments: [],
    layout: null,
  });

  let branch = "main";
  const rt = createRuntimeState({});
  rt.footerDataRef = {
    getGitBranch: () => branch,
    getExtensionStatuses: () => new Map(),
  } as typeof rt.footerDataRef;

  let component: { invalidate(): void; handleInput(data: string): void } | undefined;
  const tui = { requestRender() {} };
  const theme = {
    fg: (_color: string, text: string) => text,
    bg: (_color: string, text: string) => text,
    bold: (text: string) => text,
  };
  const ctx = {
    cwd: "/tmp/project",
    model: undefined,
    modelRegistry: {},
    sessionManager: { getBranch: () => [], getSessionId: () => "test-session" },
    settingsManager: { getCompactionSettings: () => ({ enabled: true }) },
    ui: {
      notify() {},
      custom(factory: (...args: any[]) => typeof component) {
        return new Promise((resolve) => {
          component = factory(tui, theme, {}, resolve);
        });
      },
    },
  };

  return {
    rt,
    ctx,
    get component() {
      assert.ok(component);
      return component;
    },
    setBranch(value: string) {
      branch = value;
    },
    restore() {
      setConfig(originalConfig);
    },
  };
}

test("segment navigator refresh preserves an existing selected value", async () => {
  const harness = navigatorHarness();
  try {
    const result = showSegmentNavigator(harness.rt, harness.ctx);
    harness.component.handleInput("\u001b[B");
    harness.setBranch("review-fix");
    harness.component.invalidate();
    harness.component.handleInput("\r");
    assert.equal((await result)?.id, "git");
  } finally {
    harness.restore();
  }
});

test("segment navigator refresh removes a selected value missing from rebuilt items", async () => {
  const harness = navigatorHarness();
  try {
    const result = showSegmentNavigator(harness.rt, harness.ctx);
    harness.component.handleInput("\u001b[B");
    setConfig({ ...config, disabledSegments: ["git"] });
    harness.component.invalidate();
    harness.component.handleInput("\r");
    assert.notEqual((await result)?.id, "git");
  } finally {
    harness.restore();
  }
});
