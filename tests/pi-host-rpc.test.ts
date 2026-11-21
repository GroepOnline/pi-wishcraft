import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const extensionEntry = fileURLToPath(new URL("../index.ts", import.meta.url));
const piCli = fileURLToPath(
  new URL(
    "../node_modules/@earendil-works/pi-coding-agent/dist/cli.js",
    import.meta.url,
  ),
);

// The pi host (@earendil-works/pi-coding-agent) declares engines >=22.19.0.
// Running it under an older Node exits before the extension can activate, so
// the integration test skips there instead of failing. CI runs Node 24 and
// exercises it for real; older local toolchains (and environments where the
// host is not installed) skip cleanly so `npm test` stays green everywhere.
function nodeSupportsHost(): boolean {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major === undefined || minor === undefined) return false;
  return major > 22 || (major === 22 && minor >= 19);
}

const skip = !existsSync(piCli)
  ? `pi host not installed at ${piCli}`
  : !nodeSupportsHost()
    ? `pi host requires Node >=22.19 (running ${process.versions.node})`
    : false;

interface RpcMessage {
  id?: string;
  type?: string;
  command?: string;
  method?: string;
  widgetKey?: string;
  statusKey?: string;
  widgetLines?: string[];
  widgetPlacement?: "aboveEditor" | "belowEditor";
  success?: boolean;
  data?: unknown;
  error?: unknown;
}

interface RpcWidgetUpdate {
  key: string;
  lines?: string[];
  placement?: "aboveEditor" | "belowEditor";
}

interface PromptPhase {
  id: string;
  message: string;
  success: boolean | null;
  widgets: RpcWidgetUpdate[];
  statuses: string[];
}

interface ActivationProbe {
  commands: { name: string; source: string }[];
  widgets: string[];
  statuses: string[];
  promptPhases: PromptPhase[];
  /** stdout lines that were not valid JSON — protocol corruption. */
  corruptLines: string[];
}

interface ProbeOptions {
  timeoutMs?: number;
  exerciseSignalCommands?: boolean;
}

function consumeRpcOutput(
  buffer: { value: string },
  chunk: string,
  corruptLines: string[],
  onMessage: (message: RpcMessage) => void,
): void {
  buffer.value += chunk;
  for (;;) {
    const newline = buffer.value.indexOf("\n");
    if (newline < 0) return;
    const line = buffer.value.slice(0, newline).replace(/\r$/, "");
    buffer.value = buffer.value.slice(newline + 1);
    if (!line.trim()) continue;
    let message: RpcMessage;
    try {
      message = JSON.parse(line) as RpcMessage;
    } catch (error) {
      if (error instanceof SyntaxError) {
        corruptLines.push(line);
        continue;
      }
      throw error;
    }
    onMessage(message);
  }
}

function recordUnterminatedRpcOutput(
  buffer: { value: string },
  corruptLines: string[],
): void {
  if (buffer.value.length > 0) corruptLines.push(buffer.value);
  buffer.value = "";
}

test("RPC probe records unterminated stdout as protocol corruption", () => {
  const buffer = { value: "" };
  const corruptLines: string[] = [];
  consumeRpcOutput(
    buffer,
    '{"type":"response"}\nnot-json',
    corruptLines,
    () => {},
  );
  recordUnterminatedRpcOutput(buffer, corruptLines);
  assert.deepEqual(corruptLines, ["not-json"]);
  assert.equal(buffer.value, "");
});

/**
 * Boot the real pi host in headless RPC mode with the wishcraft extension
 * loaded, ask it for the registered slash commands, and collect the UI
 * registrations the extension emits during activation. No model/API key is
 * required: `get_commands` and the activation UI requests are answered
 * locally.
 *
 * Framing follows docs/rpc.md: records are split on LF only (never on the
 * Unicode line/paragraph separators U+2028/U+2029 that `readline` would also
 * break on), and both pipes are drained continuously so the child cannot
 * stall on backpressure.
 */
function probeActivation({
  timeoutMs = 30_000,
  exerciseSignalCommands = false,
}: ProbeOptions = {}): Promise<ActivationProbe> {
  return new Promise((resolve, reject) => {
    // Isolate the probe from the operator's agent dir: a globally installed
    // copy of the extension would load next to the -e copy and duplicate
    // every command/status (the host dedupes names with a `:N` suffix).
    const agentDir = mkdtempSync(join(tmpdir(), "pi-wishcraft-rpc-"));
    const coverageDir = mkdtempSync(join(tmpdir(), "pi-wishcraft-coverage-"));
    const childEnv = { ...process.env, PI_CODING_AGENT_DIR: agentDir };
    // Keep the integration child's coverage out of the test runner's report.
    childEnv.NODE_V8_COVERAGE = coverageDir;
    delete childEnv.NODE_TEST_CONTEXT;
    delete childEnv.NODE_TEST_WORKER_ID;
    delete childEnv.NODE_OPTIONS;
    const child = spawn(
      process.execPath,
      [
        piCli,
        "--mode",
        "rpc",
        "-e",
        extensionEntry,
        "--offline",
        "--no-session",
        "--no-tools",
      ],
      {
        cwd: exerciseSignalCommands ? agentDir : repoRoot,
        stdio: ["pipe", "pipe", "pipe"],
        env: childEnv,
      },
    );

    const widgets = new Set<string>();
    const statuses = new Set<string>();
    const promptMessages = exerciseSignalCommands
      ? ["/signal placement below", "/signal", "/signal"]
      : [];
    const promptPhases: PromptPhase[] = [];
    const corruptLines: string[] = [];
    const stdout = { value: "" };
    let stderr = "";
    let settled = false;
    let response: { commands: { name: string; source: string }[] } | null =
      null;
    let failure: Error | null = null;
    let terminationStarted = false;
    let shutdownTimer: NodeJS.Timeout | null = null;
    let killTimer: NodeJS.Timeout | null = null;
    let requestTimer: NodeJS.Timeout | null = null;
    let nextPromptIndex = 0;
    let activePrompt: PromptPhase | null = null;

    const cleanupAgentDir = () => {
      try {
        rmSync(agentDir, { recursive: true, force: true });
        rmSync(coverageDir, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup; the temp dir is not part of the assertion.
      }
    };

    const terminateChild = () => {
      if (terminationStarted) return;
      terminationStarted = true;
      try {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGTERM");
        }
      } catch {
        // The host may have exited before the termination request.
      }
      killTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
        }
      }, 5_000);
    };

    const requestFailure = (error: Error) => {
      failure ??= error;
      try {
        child.stdin.end();
      } catch {
        // stdin may already be closed if the host exited first.
      }
      terminateChild();
    };

    const finishInput = () => {
      try {
        child.stdin.end();
      } catch {
        // Host already gone; the close handler will report its exit.
      }
      shutdownTimer = setTimeout(() => {
        requestFailure(
          new Error(`pi host did not exit after RPC commands.\nstderr:\n${stderr}`),
        );
      }, 10_000);
    };

    const sendNextPrompt = () => {
      const message = promptMessages[nextPromptIndex];
      if (message === undefined) {
        finishInput();
        return;
      }
      activePrompt = {
        id: `signal-${nextPromptIndex}`,
        message,
        success: null,
        widgets: [],
        statuses: [],
      };
      child.stdin.write(
        `${JSON.stringify({
          type: "prompt",
          id: activePrompt.id,
          message,
        })}\n`,
      );
    };

    const timer = setTimeout(() => {
      requestFailure(
        new Error(
          `pi host RPC probe timed out after ${timeoutMs}ms.\nstderr:\n${stderr}`,
        ),
      );
    }, timeoutMs);

    child.on("error", (error) => requestFailure(error));
    child.stdin.on("error", () => {});
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (shutdownTimer) clearTimeout(shutdownTimer);
      if (killTimer) clearTimeout(killTimer);
      if (requestTimer) clearTimeout(requestTimer);
      recordUnterminatedRpcOutput(stdout, corruptLines);
      cleanupAgentDir();

      if (failure) {
        reject(failure);
      } else if (response === null) {
        reject(
          new Error(
            `pi host exited with code ${code} before answering get_commands.\nstderr:\n${stderr}`,
          ),
        );
      } else if (code !== 0) {
        reject(
          new Error(
            `pi host exited with code ${code} after answering get_commands.\nstderr:\n${stderr}`,
          ),
        );
      } else {
        resolve({
          commands: response.commands,
          widgets: [...widgets],
          statuses: [...statuses],
          promptPhases,
          corruptLines,
        });
      }
    });

    child.stdout.on("data", (chunk) => {
      consumeRpcOutput(
        stdout,
        chunk.toString(),
        corruptLines,
        (msg) => {
          if (msg.type === "extension_ui_request") {
            if (
              msg.method === "setWidget" &&
              typeof msg.widgetKey === "string"
            ) {
              widgets.add(msg.widgetKey);
              activePrompt?.widgets.push({
                key: msg.widgetKey,
                lines: msg.widgetLines,
                placement: msg.widgetPlacement,
              });
            }
            if (
              msg.method === "setStatus" &&
              typeof msg.statusKey === "string"
            ) {
              statuses.add(msg.statusKey);
              activePrompt?.statuses.push(msg.statusKey);
            }
          }
          if (msg.type === "response" && msg.success === false) {
            requestFailure(
              new Error(`${msg.command} failed: ${String(msg.error)}`),
            );
            return;
          }
          if (msg.type === "response" && msg.command === "get_commands") {
            response = msg.data as {
              commands: { name: string; source: string }[];
            };
            if (exerciseSignalCommands) sendNextPrompt();
            else finishInput();
            return;
          }
          if (
            msg.type === "response" &&
            msg.command === "prompt" &&
            activePrompt !== null &&
            msg.id === activePrompt.id
          ) {
            activePrompt.success = msg.success === true;
            promptPhases.push(activePrompt);
            const succeeded = activePrompt.success;
            activePrompt = null;
            if (!succeeded) {
              requestFailure(new Error("RPC slash command was not handled"));
            } else {
              nextPromptIndex++;
              sendNextPrompt();
            }
          }
        },
      );
    });

    // Give the extension a moment to activate, then request the command list.
    requestTimer = setTimeout(() => {
      if (settled) return;
      child.stdin.write(
        `${JSON.stringify({ type: "get_commands", id: "1" })}\n`,
      );
    }, 1_500);
  });
}

test(
  "pi host loads the wishcraft extension and registers its slash commands",
  { skip },
  async () => {
    const { commands, corruptLines } = await probeActivation();
    // The host suffixes a command name (`name:1`) when a second registration
    // arrives — e.g. the extension loaded both via -e and from the agent
    // extensions dir. Compare on the base name.
    const byName = new Map(
      commands.map((c) => [c.name.replace(/:\d+$/, ""), c]),
    );

    // Core user-facing commands documented in README/docs must be registered
    // by the extension when the real host activates it.
    const expected = [
      "signal",
      "powerline",
      "tps",
      "usage",
      "repairs",
      "idea",
      "ideas",
      "queue",
      "skills",
      "studio",
      "bash-mode",
      "bash-reset",
      "stash-history",
      "wishcraft",
      "vibe",
      "open-ports",
      "cd",
    ];
    for (const name of expected) {
      const cmd = byName.get(name);
      assert.ok(cmd, `expected the host to register the /${name} command`);
      assert.equal(
        cmd.source,
        "extension",
        `/${name} should be an extension command, got ${cmd.source}`,
      );
    }

    // Activation must not leak non-protocol bytes onto stdout: in rpc mode
    // every stdout line is a JSONL record for the host.
    assert.deepEqual(
      corruptLines,
      [],
      "extension wrote non-JSONL output to stdout during rpc activation",
    );
  },
);

test(
  "pi host activation exports the wishcraft powerline as rpc widget lines",
  { skip },
  async () => {
    const { widgets, statuses } = await probeActivation();
    for (const widget of [
      "powerline-status",
      "powerline-top",
      "powerline-secondary",
      "powerline-bash-transcript",
      "powerline-queue-preview",
      "powerline-last-prompt",
    ]) {
      assert.ok(
        widgets.includes(widget),
        `expected the extension to export the ${widget} widget, got: ${widgets.join(", ")}`,
      );
    }
    assert.ok(
      statuses.some((key) => key.startsWith("powerline.")),
      `expected a powerline.* status registration, got: ${statuses.join(", ")}`,
    );
    assert.ok(
      statuses.includes("powerline.skills.count"),
      "RPC session startup must publish skills.count after installing its status mirror",
    );
  },
);

test(
  "pi host routes Signal placement and toggle commands through RPC widgets",
  { skip },
  async () => {
    const { corruptLines, promptPhases } = await probeActivation({
      exerciseSignalCommands: true,
    });
    const keys = [
      "powerline-status",
      "powerline-top",
      "powerline-secondary",
      "powerline-bash-transcript",
      "powerline-queue-preview",
      "powerline-last-prompt",
    ];
    const [placement, disabled, enabled] = promptPhases;

    assert.deepEqual(corruptLines, []);
    assert.equal(promptPhases.length, 3);
    assert.equal(placement?.success, true);
    assert.equal(disabled?.success, true);
    assert.equal(enabled?.success, true);
    assert.equal(
      placement?.widgets.find((widget) => widget.key === "powerline-top")
        ?.placement,
      "belowEditor",
    );
    for (const key of keys) {
      assert.ok(
        placement?.widgets.some((widget) => widget.key === key),
        `placement command did not refresh ${key}`,
      );
      assert.ok(
        disabled?.widgets.some(
          (widget) => widget.key === key && widget.lines === undefined,
        ),
        `disable command did not clear ${key}`,
      );
      assert.ok(
        enabled?.widgets.some(
          (widget) => widget.key === key && Array.isArray(widget.lines),
        ),
        `enable command did not restore ${key}`,
      );
    }
    assert.ok(
      enabled?.statuses.includes("powerline.skills.count"),
      "enabling RPC widgets must republish the skills count into the status mirror",
    );
  },
);
