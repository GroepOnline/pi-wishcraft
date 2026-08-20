import test from "node:test";
import assert from "node:assert/strict";
import type { SelectItem } from "@earendil-works/pi-tui";

import {
  applyOverlayFilter,
  applyOverlayQueryKey,
} from "../src/extension/ui/overlay-chrome.ts";

const items: SelectItem[] = [
  { label: "Change preset", value: "Change preset", description: "switch chef/default" },
  { label: "Set TPS value", value: "tps", description: "POWERLINE_TPS override" },
  { label: "Toggle UDP", value: "udp" },
];

test("applyOverlayFilter matches substring on label, value, and description", () => {
  assert.deepEqual(
    applyOverlayFilter(items, "chef").map((i) => i.value),
    ["Change preset"],
  );
  assert.deepEqual(
    applyOverlayFilter(items, "tps").map((i) => i.value),
    ["tps"],
  );
  assert.deepEqual(
    applyOverlayFilter(items, "UDP").map((i) => i.value),
    ["udp"],
  );
  assert.equal(applyOverlayFilter(items, "nope").length, 0);
  assert.equal(applyOverlayFilter(items, "  ").length, 3);
});

test("applyOverlayQueryKey types, backspaces, and clears with ctrl+u", () => {
  assert.equal(applyOverlayQueryKey("", "p"), "p");
  assert.equal(applyOverlayQueryKey("pre", "\x15"), "");
  assert.equal(applyOverlayQueryKey("pre", "\x7f"), "pr");
  assert.equal(applyOverlayQueryKey("pre", "\x1b"), null);
});
