import assert from "node:assert/strict";
import test from "node:test";
import {
  clearContributions,
  getContributedDeckRoutes,
  getContributedSignalSources,
  registerDeckRoute,
  registerSignalSource,
} from "../src/extension/contrib/registry.ts";

test("registerDeckRoute validates, deduplicates, and isolates", () => {
  clearContributions();
  assert.equal(registerDeckRoute({ id: "my-route", label: "My Route", jumpKey: "y" }), true);
  assert.equal(registerDeckRoute({ id: "my-route", label: "Duplicate" }), false);
  assert.equal(registerDeckRoute({ id: "Bad ID", label: "x" }), false);
  assert.equal(registerDeckRoute({ id: "ok", label: " " }), false);
  assert.equal(registerDeckRoute({ id: "ok2", label: "ok", jumpKey: "YY" }), false);
  assert.equal(getContributedDeckRoutes().length, 1);
  clearContributions();
});

test("registerSignalSource validates and does not throw on bad render", () => {
  clearContributions();
  assert.equal(registerSignalSource({ id: "src-a", label: "A" }), true);
  assert.equal(registerSignalSource({ id: "src-a", label: "dup" }), false);
  assert.equal(registerSignalSource({ id: "bad id", label: "x" }), false);
  assert.equal(getContributedSignalSources().length, 1);
  clearContributions();
});
