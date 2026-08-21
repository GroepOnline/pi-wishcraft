import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

function runDockerTest(...args: string[]) {
  return spawnSync("bash", [join(root, "scripts/docker-test.sh"), ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

test("cloud-agent entrypoints stay thin wrappers", () => {
  for (const name of ["cloud-agent-install.sh", "cloud-agent-start.sh", "docker-test.sh"]) {
    const source = readFileSync(join(root, "scripts", name), "utf8");
    const lines = source.split("\n").filter(Boolean);
    assert.ok(lines.length <= 4, `${name} remains a thin entrypoint`);
    assert.match(source, new RegExp(`bash-mode/cloud-agent/${name.replace(".", "\\.")}`));
    assert.match(source, /exec .*"\$@"/);
  }
});

test("docker-test rejects invalid parallel counts before contacting Docker", () => {
  const nonNumeric = runDockerTest("-n", "many");
  assert.equal(nonNumeric.status, 2);
  assert.match(nonNumeric.stderr, /positive integer/);
  assert.doesNotMatch(nonNumeric.stderr, /Docker daemon is not reachable/);

  const zero = runDockerTest("--parallel", "0");
  assert.equal(zero.status, 2);
  assert.match(zero.stderr, /at least 1/);
  assert.doesNotMatch(zero.stderr, /Docker daemon is not reachable/);
});

function writeFakeNode(home: string, version: string, eligible: boolean): string {
  const nodePath = join(home, ".nvm", "versions", "node", `v${version}`, "bin", "node");
  mkdirSync(join(nodePath, ".."), { recursive: true });
  writeFileSync(
    nodePath,
    `#!/bin/sh\nif [ "$1" = "-p" ]; then printf '%s\\n' '${version}'; exit 0; fi\nif [ "$1" = "-e" ]; then ${eligible ? "printf ok" : ":"}; exit 0; fi\nexit 1\n`,
  );
  chmodSync(nodePath, 0o755);
  return nodePath;
}

test("cloud-agent Node selection uses semver ordering", () => {
  const home = mkdtempSync(join(tmpdir(), "wishcraft-node-select-"));
  try {
    writeFakeNode(home, "22.18.0", false);
    writeFakeNode(home, "24.9.0", true);
    const expected = writeFakeNode(home, "24.10.0", true);

    const helper = join(root, "bash-mode/cloud-agent/node-selection.sh");
    const result = spawnSync(
      "bash",
      ["-c", '. "$1"; pick_compatible_node "$2"', "bash", helper, home],
      { encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, expected);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
