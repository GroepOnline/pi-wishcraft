/**
 * probe-shell.ts
 * ---------------------------------------------------------------------------
 * Shell/SSH helpers for fleet probes.
 *
 * Split out of `system.ts` so `ports.ts` can reuse them without importing the
 * segment module back (which would close a cycle once `system.ts` starts
 * consuming the shared ports parser). `system.ts` re-exports both, so every
 * existing import path keeps working.
 * ---------------------------------------------------------------------------
 */

/**
 * Validate a fleet SSH target (hostname, `user@host`, or IPv4). Rejects spaces
 * and shell metacharacters so it can't be used to inject flags/commands into
 * the `ssh` invocation.
 */
export function sanitizeSshHost(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const host = value.trim();
  return /^[A-Za-z0-9._@-]+$/.test(host) && host.length > 0 ? host : null;
}

/**
 * Wrap a probe command for a remote host, or return it unchanged for local
 * probing. Remote commands are quoted so the local shell can't reinterpret the
 * inner `2>/dev/null`; `BatchMode` fails fast (no password prompt) on hosts
 * that require interactive auth or an unknown host key.
 */
export function sshCommand(
  host: string | undefined,
  remoteCmd: string,
): string | null {
  if (!host) return remoteCmd;
  const safe = sanitizeSshHost(host);
  if (!safe) return null;
  return `ssh -o ConnectTimeout=3 -o BatchMode=yes ${safe} ${JSON.stringify(remoteCmd)} 2>/dev/null`;
}
