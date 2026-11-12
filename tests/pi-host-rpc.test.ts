import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
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
  success?: boolean;
  data?: unknown;
  error?: unknown;
}

interface ActivationProbe {
  commands: { name: string; source: string }[];
  widgets: string[];
  statuses: string[];
  /** stdout lines that were not valid JSON — protocol corruption. */
  corruptLines: string[];
}

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
function probeActivation(timeoutMs = 30_000): Promise<ActivationProbe> {
  return new Promise((resolve, reject) => {
    // Isolate the probe from the operator's agent dir: a globally installed
    // copy of the extension would load next to the -e copy and duplicate
    // every command/status (the host dedupes names with a `:N` suffix).
    const agentDir = mkdtempSync(join(tmpdir(), "pi-wishcraft-rpc-"));
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
        cwd: repoRoot,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, PI_CODING_AGENT_DIR: agentDir },
      },
    );

    const widgets = new Set<string>();
    const statuses = new Set<string>();
    const corruptLines: string[] = [];
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.stdin.end();
      } catch {
        // stdin may already be closed if the host exited first.
      }
      child.kill();
      fn();
    };

    const timer = setTimeout(() => {
      finish(() =>
        reject(
          new Error(
            `pi host RPC probe timed out after ${timeoutMs}ms.\nstderr:\n${stderr}`,
          ),
        ),
      );
    }, timeoutMs);

    child.on("error", (err) => finish(() => reject(err)));

    // A write after the host has exited is reported by the close handler.
    child.stdin.on("error", () => {});

    child.on("close", (code) => {
      finish(() =>
        reject(
          new Error(
            `pi host exited with code ${code} before answering get_commands.\nstderr:\n${stderr}`,
          ),
        ),
      );
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      for (;;) {
        const newline = stdout.indexOf("\n");
        if (newline < 0) break;
        const line = stdout.slice(0, newline).replace(/\r$/, "");
        stdout = stdout.slice(newline + 1);
        if (!line.trim()) continue;
        let msg: RpcMessage;
        try {
          msg = JSON.parse(line) as RpcMessage;
        } catch {
          // Any non-JSON record on stdout breaks every rpc host's framing.
          corruptLines.push(line);
          continue;
        }
        if (msg.type === "extension_ui_request") {
          if (msg.method === "setWidget" && typeof msg.widgetKey === "string") {
            widgets.add(msg.widgetKey);
          }
          if (msg.method === "setStatus" && typeof msg.statusKey === "string") {
            statuses.add(msg.statusKey);
          }
        }
        if (msg.type === "response" && msg.command === "get_commands") {
          if (msg.success !== true) {
            finish(() =>
              reject(new Error(`get_commands failed: ${String(msg.error)}`)),
            );
            return;
          }
          const data = msg.data as {
            commands: { name: string; source: string }[];
          };
          finish(() =>
            resolve({
              commands: data.commands,
              widgets: [...widgets],
              statuses: [...statuses],
              corruptLines,
            }),
          );
          return;
        }
      }
    });

    // Give the extension a moment to activate, then request the command list.
    setTimeout(() => {
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
    for (const widget of ["powerline-status", "powerline-top"]) {
      assert.ok(
        widgets.includes(widget),
        `expected the extension to export the ${widget} widget, got: ${widgets.join(", ")}`,
      );
    }
    assert.ok(
      statuses.some((key) => key.startsWith("powerline.")),
      `expected a powerline.* status registration, got: ${statuses.join(", ")}`,
    );
  },
);
