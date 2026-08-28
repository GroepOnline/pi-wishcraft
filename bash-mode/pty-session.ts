/**
 * pty-session.ts
 * ------------------------------------------------------------------------
 * PTY-backed command execution for bash mode v2 (plan U3, KTD2).
 *
 * Wraps `script(1)` (util-linux) to allocate a real PTY per command, so
 * stdin-reading programs work and SGR color survives into the transcript.
 * The ANSI filter keeps only SGR sequences (plus plain text); OSC, DCS,
 * cursor-positioning CSI and C0 control noise are stripped — a transcript
 * must never relay terminal-control escapes back into the host terminal.
 *
 * When `script` is unavailable, the session degrades per command to plain
 * pipe execution (v1 behavior, no color). SIGWINCH/resize forwarding is a
 * known `script(1)` ceiling — swap for node-pty only if that bites
 * (ponytail: revisit on real demand, not speculatively).
 * ------------------------------------------------------------------------
 */

import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";

const DONE_SENTINEL = "__PI_DONE__";

export interface PtyFilterOptions {
  /** Keep SGR color sequences; false strips them too (plain-text mode). */
  color: boolean;
}

export interface PtyRunResult {
  exitCode: number;
  cwd: string;
}

export interface PtyShellSessionOptions {
  cwd: string;
  /** Emit filtered output lines as they arrive. */
  onOutput: (line: string) => void;
  onStateChange: () => void;
  /** Keep SGR colors (PTY mode default capability). Default true. */
  color?: boolean;
  /** Override for the `script` availability probe (tests). */
  scriptAvailable?: () => boolean;
  /** Override user shell path (tests). */
  shellPath?: string;
}

/**
 * Filter raw PTY output. Keeps text, newlines, tabs, and (optionally) SGR
 * escapes. Strips OSC/DCS sequences, non-SGR CSI sequences, and C0 control
 * noise including the CR of CRLF pairs.
 */
export function filterPtyOutput(chunk: string, options: PtyFilterOptions): string {
  let out = chunk;

  // OSC sequences: ESC ] ... (BEL or ST)
  out = out.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "");
  // DCS/SOS/PM/APC sequences: ESC P ... ST
  out = out.replace(/\x1b[P^_][^\x07\x1b]*(?:\x07|\x1b\\)/g, "");

  if (options.color) {
    // Protect SGR sequences behind Private Use Area sentinels so the C0
    // strip below cannot eat their ESC introducers, strip every other CSI.
    const kept: string[] = [];
    out = out.replace(/\x1b\[[0-9;]*m/g, (m) => {
      kept.push(m);
      return `\uE000${kept.length - 1}\uE001`;
    });
    out = out.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");
    // C0 noise: drop everything except \n and \t; \r is dropped (CRLF -> LF).
    out = out.replace(/[\x00-\x09\x0b-\x1f\x7f]/g, (c) => (c === "\t" ? c : ""));
    out = out.replace(/\uE000(\d+)\uE001/g, (_, i: string) => kept[Number.parseInt(i, 10)] ?? "");
    return out;
  }

  // Strip all CSI including SGR.
  out = out.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");
  // C0 noise: drop everything except \n and \t; \r is dropped (CRLF -> LF).
  out = out.replace(/[\x00-\x09\x0b-\x1f\x7f]/g, (c) => (c === "\t" ? c : ""));
  return out;
}

function quoteShellArg(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function getCloseExitCode(code: number | null, signal: NodeJS.Signals | null): number {
  if (typeof code === "number") return code;
  if (signal === "SIGINT") return 130;
  if (signal === "SIGTERM") return 143;
  if (signal === "SIGKILL") return 137;
  return 1;
}

function buildWrapper(shellName: string, cwd: string, file: string): string {
  const quotedCwd = quoteShellArg(cwd);
  const quotedFile = quoteShellArg(file);
  if (shellName.includes("fish")) {
    return `cd ${quotedCwd}; and source ${quotedFile}; printf '\\n${DONE_SENTINEL}:%s:%s\\n' $status $PWD`;
  }
  return `cd ${quotedCwd} && . ${quotedFile}; printf '\\n${DONE_SENTINEL}:%s:%s\\n' "$?" "$PWD"`;
}

interface RunningCommand {
  id: number;
  buffer: string;
  /** Trailing partial escape sequence carried across chunks. */
  escapeTail: string;
  resolve: (result: PtyRunResult) => void;
  settled: boolean;
}

export class PtyShellSession {
  private readonly startCwd: string;
  private readonly onOutput: (line: string) => void;
  private readonly onStateChange: () => void;
  private readonly color: boolean;
  private readonly scriptProbe: () => boolean;
  private readonly shellPath: string;
  private readonly shellName: string;
  private readonly tempDir = mkdtempSync(join(tmpdir(), "wishcraft-pty-"));
  private child: ChildProcessWithoutNullStreams | null = null;
  private commandCounter = 0;
  private running: RunningCommand | null = null;
  private disposed = false;
  private interrupted = false;

  state: { running: boolean; cwd: string; lastExitCode: number | null; mode: "pty" | "pipe" };

  constructor(options: PtyShellSessionOptions) {
    this.startCwd = options.cwd;
    this.onOutput = options.onOutput;
    this.onStateChange = options.onStateChange;
    this.color = options.color ?? true;
    this.scriptProbe = options.scriptAvailable ?? (() => defaultScriptAvailable());
    this.shellPath = options.shellPath ?? process.env["SHELL"] ?? "/bin/sh";
    this.shellName = basename(this.shellPath).toLowerCase();
    this.state = {
      running: false,
      cwd: options.cwd,
      lastExitCode: null,
      mode: this.scriptProbe() ? "pty" : "pipe",
    };
  }

  childPid(): number | null {
    return this.child?.pid ?? null;
  }

  async runCommand(command: string): Promise<PtyRunResult> {
    if (this.disposed) throw new Error("Session disposed");
    if (this.state.running) throw new Error("Command already running");

    const id = ++this.commandCounter;
    const extension = this.shellName.includes("fish") ? "fish" : "sh";
    const file = join(this.tempDir, `cmd-${id}.${extension}`);
    writeFileSync(file, command.endsWith("\n") ? command : `${command}\n`, "utf8");

    const wrapper = buildWrapper(this.shellName, this.state.cwd, file);
    const usePty = this.scriptProbe();

    return new Promise<PtyRunResult>((resolve) => {
      const running: RunningCommand = {
        id,
        buffer: "",
        escapeTail: "",
        resolve: (result) => {
          if (running.settled) return;
          running.settled = true;
          this.state.running = false;
          this.state.lastExitCode = result.exitCode;
          this.state.cwd = result.cwd;
          this.running = null;
          this.onStateChange();
          rmSync(file, { force: true });
          resolve(result);
        },
        settled: false,
      };
      this.running = running;
      this.state.running = true;
      this.state.mode = usePty ? "pty" : "pipe";
      this.interrupted = false;
      this.onStateChange();

      const child = usePty
        ? spawn("script", ["-qec", wrapper, "/dev/null"], {
            cwd: this.state.cwd,
            env: { ...process.env, SHELL: this.shellPath },
            stdio: ["pipe", "pipe", "pipe"],
            detached: true,
          })
        : spawn(this.shellPath, ["-c", buildWrapper(this.shellName, this.state.cwd, file)], {
            cwd: this.state.cwd,
            env: process.env,
            stdio: ["pipe", "pipe", "pipe"],
            detached: true,
          });

      this.child = child as ChildProcessWithoutNullStreams;
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdin.on("error", () => {
        // EPIPE after the child exits: input loss at teardown is expected.
        // Without this listener a keystroke racing the exit would raise an
        // unhandled error on the stdin stream and take down the host.
      });
      child.stdout.on("data", (chunk: string) => this.handleChunk(String(chunk)));
      child.stderr.on("data", (chunk: string) => this.handleChunk(String(chunk)));
      child.on("error", (error) => {
        // spawn itself failed (script removed between probe and spawn, dead
        // SHELL path): surface the reason, then settle as a normal failure.
        // The first script-path failure also flips the probe cache so the
        // next command degrades to pipes instead of silently failing again.
        console.warn(
          "[wishcraft] spawn failed:",
          error instanceof Error ? error.message : String(error),
        );
        if (usePty) {
          _resetScriptAvailableForTests();
        }
        running.resolve({ exitCode: 1, cwd: this.state.cwd });
      });
      child.on("close", (code, signal) => {
        this.child = null;
        // No sentinel observed. An operator interrupt never lets the command
        // complete, so it maps to 130 regardless of how `script` exits.
        if (this.interrupted) {
          running.resolve({ exitCode: 130, cwd: this.state.cwd });
          return;
        }
        running.resolve({
          exitCode: getCloseExitCode(code, signal),
          cwd: this.state.cwd,
        });
      });
    });
  }

  writeStdin(data: string): void {
    if (this.child == null || this.child.stdin.destroyed) return;
    this.child.stdin.write(data);
  }

  interrupt(): void {
    if (!this.child || !this.state.running) return;
    this.interrupted = true;
    this.signalGroup("SIGINT");
  }

  dispose(): void {
    this.disposed = true;
    if (this.child) {
      this.signalGroup("SIGKILL");
      this.child = null;
    }
    this.running = null;
    this.state.running = false;
    rmSync(this.tempDir, { recursive: true, force: true });
  }

  private signalGroup(signal: NodeJS.Signals): void {
    const pid = this.child?.pid;
    if (typeof pid !== "number") return;
    try {
      process.kill(-pid, signal);
    } catch {
      try {
        this.child?.kill(signal);
      } catch {
        // Process group and direct kill both failed: nothing left to signal.
      }
    }
  }

  private handleChunk(chunk: string): void {
    const running = this.running;
    if (!running || running.settled) return;

    const merged = running.escapeTail + chunk;
    running.escapeTail = "";

    // Carry a trailing partial escape (unterminated CSI/OSC/DCS) to the next
    // chunk so split sequences cannot leak their introducer into output.
    let work = merged;
    const partial = /(?:\x1b(?:\[[0-9;?]*[ -/]*|\][^\x07\x1b]*|[P^_][^\x07\x1b]*))$/.exec(work);
    if (partial) {
      running.escapeTail = partial[0];
      work = work.slice(0, work.length - running.escapeTail.length);
    }

    const color = this.color && this.state.mode === "pty";
    const filtered = filterPtyOutput(work, { color });

    running.buffer += filtered;
    const parts = running.buffer.split("\n");
    running.buffer = parts.pop() ?? "";

    for (const rawLine of parts) {
      const line = rawLine.replace(/\r$/, "");
      if (line.startsWith(`${DONE_SENTINEL}:`)) {
        const rest = line.slice(DONE_SENTINEL.length + 1);
        // exit code may not contain ':'; cwd may (rare) — split on first two only.
        const firstColon = rest.indexOf(":");
        if (firstColon !== -1) {
          const exitCode = Number.parseInt(rest.slice(0, firstColon), 10);
          const cwd = rest.slice(firstColon + 1);
          running.resolve({
            exitCode: Number.isFinite(exitCode) ? exitCode : 1,
            cwd: cwd || this.state.cwd,
          });
          return;
        }
        continue;
      }
      if (line.trim().length > 0) {
        this.onOutput(line);
      }
    }
  }
}

let scriptAvailableCache: boolean | null = null;

export function defaultScriptAvailable(): boolean {
  if (scriptAvailableCache === null) {
    try {
      const probe = spawnSync("script", ["--version"], { stdio: "ignore" });
      scriptAvailableCache = probe.status === 0;
    } catch {
      scriptAvailableCache = false;
    }
  }
  return scriptAvailableCache;
}

export function _resetScriptAvailableForTests(): void {
  scriptAvailableCache = null;
}
