import assert from "node:assert/strict";
import test from "node:test";
import {
  createForwardState,
  handleForwardInput,
  type ForwardState,
} from "../bash-mode/forward.ts";
import { appendColored } from "../bash-mode/transcript-v2.ts";
import { visibleWidth } from "@earendil-works/pi-tui";
import { PtyShellSession } from "../bash-mode/pty-session.ts";

const makeForward = (): ForwardState => createForwardState();

test("forward reducer: printable data routes to stdin when running", () => {
  const s0 = makeForward();
  const s1 = { ...s0, running: true };
  const out = handleForwardInput(s1, "echo hello\n");
  assert.equal(out.ptyAction, "stdin");
  assert.equal(out.state, s1);
});

test("forward reducer: Ctrl-C routes to interrupt when running", () => {
  const s1 = { ...makeForward(), running: true };
  const out = handleForwardInput(s1, "\x03");
  assert.equal(out.ptyAction, "interrupt");
});

test("forward reducer: input while idle is a no-op (no pty action)", () => {
  const s0 = makeForward();
  const out = handleForwardInput(s0, "echo hi\n");
  assert.equal(out.ptyAction, undefined);
  assert.equal(out.state, s0);
});

test("forward reducer: empty data is a no-op", () => {
  const s1 = { ...makeForward(), running: true };
  const out = handleForwardInput(s1, "");
  assert.equal(out.ptyAction, undefined);
});

test("forward reducer: an exit sentinel transitions to finished with exit code", () => {
  const s1 = { ...makeForward(), running: true };
  const out = handleForwardInput(s1, "__PI_DONE__:0:/tmp");
  assert.equal(out.state.running, false);
  assert.equal(out.state.lastExitCode, 0);
  assert.equal(out.state.cwd, "/tmp");
  assert.equal(out.ptyAction, undefined);
});

test("transcript v2: appends a fresh line, keeping ANSI color", () => {
  const buf: string[] = [];
  const next = appendColored(buf, "\x1b[31mred\x1b[0m\n", 80);
  assert.equal(next.length, 1);
  assert.equal(next[0], "\x1b[31mred\x1b[0m");
});

test("transcript v2: truncation respects visible width and pairs SGR", () => {
  const buf: string[] = [];
  const next = appendColored(
    buf,
    "\x1b[31mred green blue yellow\x1b[0m\n",
    10,
  );
  // visible width <= 10; SGR pair must remain balanced (open + close)
  assert.ok(visibleWidth(next[0] ?? "") <= 10, `width=${visibleWidth(next[0] ?? "")}`);
  const opens = (next[0] ?? "").match(/\x1b\[31m/g)?.length ?? 0;
  const closes = (next[0] ?? "").match(/\x1b\[0m/g)?.length ?? 0;
  assert.equal(opens, closes);
});

test("transcript v2: malformed (dangling) SGR is dropped, not propagated", () => {
  const buf: string[] = [];
  const next = appendColored(buf, "\x1b[31no terminator\n", 80);
  const opens = (next[0] ?? "").match(/\x1b\[31m/g)?.length ?? 0;
  assert.equal(opens, 0);
});

test("integration: PtyShellSession → forward reducer + transcript v2 wiring", async () => {
  const events: string[] = [];
  const lines: string[] = [];
  let state = createForwardState();
  const session = new PtyShellSession({
    cwd: process.cwd(),
    onOutput: (line) => {
      events.push(`output:${line}`);
      lines.push(line);
    },
    onStateChange: () => {
      events.push(`state:${state.running ? "running" : "idle"}`);
    },
    color: true,
    scriptAvailable: () => false,
  });
  state = { ...state, running: true };
  const result = await session.runCommand("printf 'a\\nb\\nc\\n'");
  for (const line of lines) {
    handleForwardInput(state, `__PI_LINE__:${line}`);
  }
  state = { ...state, running: false, lastExitCode: result.exitCode, cwd: result.cwd };
  assert.equal(result.exitCode, 0);
  assert.ok(lines.length >= 1, `expected at least 1 output line, got ${lines.length}`);
  assert.ok(events.some((e) => e.startsWith("output:")), "no output events");
});
