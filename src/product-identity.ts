import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BUILD_SHA_ENV = "PI_WISHCRAFT_BUILD_SHA";
export const BUILD_STAMP_FILE = "build-stamp.json";
const SHA_RE = /^[0-9a-f]{40}$/;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export type ProductIdentity = {
  version: string;
  source_sha: string | null;
};

function readJson(relativePath: string, rootDir = root): unknown {
  return JSON.parse(readFileSync(path.join(rootDir, relativePath), "utf8"));
}

export function readPackageVersion(rootDir = root): string {
  const pkg = readJson("package.json", rootDir);
  if (typeof pkg !== "object" || pkg === null) {
    throw new Error("package.json is not an object");
  }
  const version = (pkg as { version?: unknown }).version;
  if (typeof version !== "string" || !version.trim()) {
    throw new Error("package.json version is missing");
  }
  return version.trim();
}

function parseSha(raw: string, label: string): string {
  const sha = raw.trim();
  if (!SHA_RE.test(sha)) {
    throw new Error(`${label} must be a 40-character lowercase hex SHA, or unset`);
  }
  return sha;
}

export function readStampSha(rootDir = root): string | null {
  const stampPath = path.join(rootDir, BUILD_STAMP_FILE);
  if (!existsSync(stampPath)) return null;
  const stamp = JSON.parse(readFileSync(stampPath, "utf8")) as {
    source_sha?: unknown;
    sha?: unknown;
  };
  const raw = stamp.source_sha ?? stamp.sha;
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string") {
    throw new Error(`${BUILD_STAMP_FILE} source_sha must be a string or omitted`);
  }
  return parseSha(raw, BUILD_STAMP_FILE);
}

export function readBuildSha(
  env: NodeJS.ProcessEnv = process.env,
  name = BUILD_SHA_ENV,
  rootDir = root,
): string | null {
  const raw = String(env[name] ?? "").trim();
  if (raw) return parseSha(raw, name);
  return readStampSha(rootDir);
}

export function readProductIdentity(
  env: NodeJS.ProcessEnv = process.env,
  rootDir = root,
): ProductIdentity {
  return {
    version: readPackageVersion(rootDir),
    source_sha: readBuildSha(env, BUILD_SHA_ENV, rootDir),
  };
}

export function formatProductIdentity(identity: ProductIdentity): string {
  return `${JSON.stringify(identity)}\n`;
}

function isDirectEntrypoint(): boolean {
  if (!process.argv[1]) return false;
  return fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}

if (isDirectEntrypoint() && process.argv.includes("--version")) {
  process.stdout.write(formatProductIdentity(readProductIdentity()));
}
