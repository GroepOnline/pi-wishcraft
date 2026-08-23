// Leaf module: stable predicate used by session-lifecycle and queue-integration
// without creating a circular import through session-lifecycle.

export function isStaleExtensionContextError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes("This extension instance is stale") ||
      error.message.includes("This extension ctx is stale"))
  );
}
