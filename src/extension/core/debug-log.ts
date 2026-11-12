/**
 * Diagnostics go to stderr, never stdout. In `pi --mode rpc` stdout is the
 * JSONL protocol channel — a `console.debug` line there corrupts framing for
 * the host. Use this instead of `console.debug` anywhere the extension can
 * run under an rpc host.
 */
export function debugLog(message: string, ...args: unknown[]): void {
  console.error(message, ...args);
}
