import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { filterPtyOutput, PtyShellSession } from "../bash-mode/pty-session.ts";

const SCRIPT_AVAILABLE = await (async () => {
  try {
    const { execFileSync } = await import("node:child_process");
    execFileSync("script", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "pty-session-test-"));
}

test("filterPtyOutput keeps SGR sequences when color enabled", () => {
  const input = "\x1b[31mred\x1b[0m plain";
  const out = filterPtyOutput(input, { color: true });
  assert.equal(out, "\x1b[31mred\x1b[0m plain");
});

test("filterPtyOutput strips SGR sequences when color disabled", () => {
  const input = "\x1b[31mred\x1b[0m plain";
  const out = filterPtyOutput(input, { color: false });
  assert.equal(out, "red plain");
});

test("filterPtyOutput strips OSC and non-SGR CSI escapes even with color on", () => {
  const input = "a\x1b]0;title\x07b\x1b[2Jc\x1b[1;32mgreen\x1b[0md";
  const out = filterPtyOutput(input, { color: true });
  assert.equal(out, "abc\x1b[1;32mgreen\x1b[0md");
});

test("filterPtyOutput strips control noise but keeps newline and tab", () => {
  const input = "one\x07two\r\nthree\tfour\x08";
  const out = filterPtyOutput(input, { color: true });
  assert.equal(out, "onetwo\nthree\tfour");
});

test("filterPtyOutput drops DCS sequences", () => {
  const input = "x\x1bP1;2q\x1b\\y";
  const out = filterPtyOutput(input, { color: true });
  assert.equal(out, "xy");
});

test("PtyShellSession runs a simple command and reports exit code and cwd", { skip: !SCRIPT_AVAILABLE }, async () => {
  const dir = makeTempDir();
  const lines: string[] = [];
  const session = new PtyShellSession({
    cwd: dir,
    onOutput: (line) => lines.push(line),
    onStateChange: () => {},
  });
  const result = await session.runCommand("echo hello");
  assert.equal(result.exitCode, 0);
  assert.equal(result.cwd, dir);
  assert.ok(lines.includes("hello"), `expected 'hello' in output lines: ${JSON.stringify(lines)}`);
  session.dispose();
  rmSync(dir, { recursive: true, force: true });
});

test("PtyShellSession preserves color output when color enabled", { skip: !SCRIPT_AVAILABLE }, async () => {
  const dir = makeTempDir();
  const lines: string[] = [];
  const session = new PtyShellSession({
    cwd: dir,
    color: true,
    onOutput: (line) => lines.push(line),
    onStateChange: () => {},
  });
  await session.runCommand("printf '\\033[31mred\\033[0m\\n'");
  const red = lines.find((l) => l.includes("red"));
  assert.ok(red, `expected a 'red' line: ${JSON.stringify(lines)}`);
  assert.ok(red.includes("\x1b[31m"), "expected SGR escape retained in colored mode");
  session.dispose();
  rmSync(dir, { recursive: true, force: true });
});

test("PtyShellSession strips color when color disabled", { skip: !SCRIPT_AVAILABLE }, async () => {
  const dir = makeTempDir();
  const lines: string[] = [];
  const session = new PtyShellSession({
    cwd: dir,
    color: false,
    onOutput: (line) => lines.push(line),
    onStateChange: () => {},
  });
  await session.runCommand("printf '\\033[31mred\\033[0m\\n'");
  const red = lines.find((l) => l.includes("red"));
  assert.ok(red, `expected a 'red' line: ${JSON.stringify(lines)}`);
  assert.ok(!red.includes("\x1b"), "expected no escapes in plain mode");
  session.dispose();
  rmSync(dir, { recursive: true, force: true });
});

test("PtyShellSession tracks cwd changes", { skip: !SCRIPT_AVAILABLE }, async () => {
  const dir = makeTempDir();
  const target = mkdtempSync(join(tmpdir(), "pty-cwd-target-"));
  const session = new PtyShellSession({
    cwd: dir,
    onOutput: () => {},
    onStateChange: () => {},
  });
  const result = await session.runCommand(`cd ${JSON.stringify(target)}`);
  assert.equal(result.exitCode, 0);
  assert.equal(result.cwd, target);
  session.dispose();
  rmSync(dir, { recursive: true, force: true });
  rmSync(target, { recursive: true, force: true });
});

test("PtyShellSession reports non-zero exit code from shell exit", { skip: !SCRIPT_AVAILABLE }, async () => {
  const dir = makeTempDir();
  const session = new PtyShellSession({
    cwd: dir,
    onOutput: () => {},
    onStateChange: () => {},
  });
  const result = await session.runCommand("exit 3");
  assert.equal(result.exitCode, 3);
  session.dispose();
  rmSync(dir, { recursive: true, force: true });
});

test("PtyShellSession forwards stdin to a reading process", { skip: !SCRIPT_AVAILABLE }, async () => {
  const dir = makeTempDir();
  const lines: string[] = [];
  const session = new PtyShellSession({
    cwd: dir,
    onOutput: (line) => lines.push(line),
    onStateChange: () => {},
  });
  const runPromise = session.runCommand("read -r pty_answer; echo \"got:$pty_answer\"");
  await new Promise((resolve) => setTimeout(resolve, 700));
  session.writeStdin("hi-from-stdin\n");
  const result = await runPromise;
  assert.equal(result.exitCode, 0);
  assert.ok(lines.includes("got:hi-from-stdin"), `expected stdin echo line: ${JSON.stringify(lines)}`);
  session.dispose();
  rmSync(dir, { recursive: true, force: true });
});

test("PtyShellSession interrupt resolves with exit code 130", { skip: !SCRIPT_AVAILABLE }, async () => {
  const dir = makeTempDir();
  const session = new PtyShellSession({
    cwd: dir,
    onOutput: () => {},
    onStateChange: () => {},
  });
  const runPromise = session.runCommand("sleep 30");
  await new Promise((resolve) => setTimeout(resolve, 700));
  session.interrupt();
  const result = await runPromise;
  assert.equal(result.exitCode, 130);
  session.dispose();
  rmSync(dir, { recursive: true, force: true });
});

test("PtyShellSession falls back to pipe execution when script is unavailable", async () => {
  const dir = makeTempDir();
  const lines: string[] = [];
  const session = new PtyShellSession({
    cwd: dir,
    onOutput: (line) => lines.push(line),
    onStateChange: () => {},
    scriptAvailable: () => false,
  });
  const result = await session.runCommand("echo piped");
  assert.equal(result.exitCode, 0);
  assert.equal(result.cwd, dir);
  assert.ok(lines.includes("piped"), `expected 'piped' in output lines: ${JSON.stringify(lines)}`);
  session.dispose();
  rmSync(dir, { recursive: true, force: true });
});

test("PtyShellSession dispose kills a running child without orphans", { skip: !SCRIPT_AVAILABLE }, async () => {
  const dir = makeTempDir();
  const session = new PtyShellSession({
    cwd: dir,
    onOutput: () => {},
    onStateChange: () => {},
  });
  const runPromise = session.runCommand("sleep 30");
  await new Promise((resolve) => setTimeout(resolve, 700));
  const childPid = session.childPid();
  assert.ok(typeof childPid === "number" && childPid > 0);
  session.dispose();
  await runPromise.catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 400));
  let alive = false;
  try {
    process.kill(childPid!, 0);
    alive = true;
  } catch {
    alive = false;
  }
  assert.equal(alive, false, `child ${childPid} should be gone after dispose`);
  rmSync(dir, { recursive: true, force: true });
});

test("filterPtyOutput neutralizes a trailing partial escape (reassembly is the session's job)", () => {
  // An unterminated CSI introducer at a chunk boundary loses its ESC to the
  // C0 strip; PtyShellSession additionally buffers partial tails so the
  // reassembled sequence is filtered as a whole.
  const a = filterPtyOutput("text\x1b[", { color: true });
  assert.equal(a, "text[");
});
